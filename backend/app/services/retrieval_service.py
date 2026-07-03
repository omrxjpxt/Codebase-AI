import uuid
import time
import logging
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from google import genai
from collections import defaultdict

from app.core.config import settings
from app.models.chunk import Chunk
from app.models.file import File

logger = logging.getLogger(__name__)

from app.services.gemini_service import gemini_service

async def generate_query_embedding(question: str) -> list[float]:
    return await gemini_service.embed_content(text=question)

async def retrieve_relevant_chunks(
    db: AsyncSession, 
    repository_id: uuid.UUID, 
    question: str, 
    top_k: int = 8
) -> List[Dict[str, Any]]:
    start_time = time.time()
    
    query_embedding = await generate_query_embedding(question)
    
    # Fetch more candidates to allow for diversity and deduplication
    stmt = (
        select(
            Chunk, 
            File, 
            Chunk.embedding.cosine_distance(query_embedding).label("distance")
        )
        .join(File, Chunk.file_id == File.id)
        .where(Chunk.repository_id == repository_id)
        .where(Chunk.embedding.is_not(None))
        .order_by(Chunk.embedding.cosine_distance(query_embedding))
        .limit(top_k * 3)
    )
    
    results = await db.execute(stmt)
    rows = results.all()
    
    unique_contents = set()
    file_counts = defaultdict(int)
    selected_chunks = []
    
    # 1. Deduplication & 2. Diversity
    for row in rows:
        chunk = row.Chunk
        file_obj = row.File
        
        if chunk.content in unique_contents:
            continue
            
        if file_counts[file_obj.id] >= (top_k / 2) and len(selected_chunks) < top_k:
            continue
            
        unique_contents.add(chunk.content)
        file_counts[file_obj.id] += 1
        
        distance = row.distance
        score = 1.0 - (distance if distance is not None else 1.0)
        
        selected_chunks.append({
            "chunk_id": str(chunk.id),
            "file": file_obj.path.split('/')[-1],
            "file_id": str(file_obj.id),
            "path": file_obj.path,
            "content": chunk.content,
            "score": score,
            "chunk_index": chunk.metadata_.get("chunk_index", 0),
            "start_line": chunk.metadata_.get("start_line"),
            "end_line": chunk.metadata_.get("end_line"),
            "file_content": file_obj.content
        })
        
        if len(selected_chunks) >= top_k:
            break
            
    # 3. Merge Adjacent Chunks
    by_file = defaultdict(list)
    for c in selected_chunks:
        by_file[c["file_id"]].append(c)
        
    merged_sources = []
    for file_id, file_chunks in by_file.items():
        # sort by chunk_index
        file_chunks.sort(key=lambda x: x["chunk_index"])
        
        merged_block = []
        for c in file_chunks:
            if not merged_block:
                merged_block.append(c)
            else:
                last_c = merged_block[-1]
                if c["chunk_index"] <= last_c["chunk_index"] + 1:
                    # Adjacent or same chunk, merge them
                    last_c["end_line"] = max(last_c.get("end_line") or 0, c.get("end_line") or 0)
                    last_c["score"] = max(last_c["score"], c["score"]) # Keep highest score
                    
                    # Update content from full file if we have start_line and end_line
                    if last_c.get("start_line") and last_c.get("end_line") and last_c.get("file_content"):
                        lines = last_c["file_content"].split('\n')
                        start = max(0, last_c["start_line"] - 1)
                        end = last_c["end_line"]
                        last_c["content"] = '\n'.join(lines[start:end])
                    else:
                        # Fallback concatenation
                        last_c["content"] += "\n" + c["content"]
                else:
                    merged_block.append(c)
                    
        merged_sources.extend(merged_block)
        
    # Sort final sources by score descending
    merged_sources.sort(key=lambda x: x["score"], reverse=True)
    
    # Clean up large file_content before returning
    for source in merged_sources:
        source.pop("file_content", None)
        # Round score
        source["score"] = round(source["score"], 3)
        
    duration = time.time() - start_time
    logger.info(f"Retrieval for repo {repository_id} took {duration:.2f}s, found {len(merged_sources)} merged sources.")
    return merged_sources
