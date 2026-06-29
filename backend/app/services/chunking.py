def chunk_file(content: str, chunk_size: int = 1500, overlap: int = 200) -> list[str]:
    """
    Splits file content into chunks of specified size with overlap.
    """
    if not content:
        return []
    
    chunks = []
    start = 0
    content_length = len(content)
    
    while start < content_length:
        end = min(start + chunk_size, content_length)
        chunk = content[start:end]
        chunks.append(chunk)
        if end == content_length:
            break
        start += chunk_size - overlap
        
    return chunks
