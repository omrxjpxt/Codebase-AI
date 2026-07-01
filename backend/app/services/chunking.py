def chunk_file(content: str, chunk_size: int = 1500, overlap: int = 200) -> list[dict]:
    """
    Splits file content into chunks of specified size with overlap,
    tracking start and end line numbers.
    """
    if not content:
        return []
    
    chunks = []
    start = 0
    content_length = len(content)
    
    while start < content_length:
        end = min(start + chunk_size, content_length)
        # Ensure we don't cut words or lines in half if possible, but for simplicity we'll just track lines
        chunk_text = content[start:end]
        
        # Calculate line numbers
        start_line = content.count('\n', 0, start) + 1
        end_line = start_line + chunk_text.count('\n')
        
        chunks.append({
            "content": chunk_text,
            "start_line": start_line,
            "end_line": end_line
        })
        
        if end == content_length:
            break
        start += chunk_size - overlap
        
    return chunks
