import os
import zipfile
import tempfile
import shutil

IGNORE_DIRS = {"node_modules", ".git", "dist", "build", "coverage", "__pycache__", ".next"}
SUPPORTED_EXTENSIONS = {
    ".py": "Python",
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".jsx": "JavaScript",
    ".java": "Java",
    ".dart": "Dart",
    ".json": "JSON",
    ".md": "Markdown",
    ".html": "HTML",
    ".css": "CSS",
}

def is_ignored_path(path: str) -> bool:
    parts = path.split(os.sep)
    for part in parts:
        if part in IGNORE_DIRS or part.startswith('.'):
            if part not in {".env.example", ".gitignore"}: # allow some specific dot files if needed
                return True
    return False

def detect_language(filename: str) -> str | None:
    _, ext = os.path.splitext(filename)
    return SUPPORTED_EXTENSIONS.get(ext.lower())

def extract_and_scan_zip(zip_filepath: str) -> list[dict]:
    extracted_files = []
    
    with tempfile.TemporaryDirectory() as temp_dir:
        with zipfile.ZipFile(zip_filepath, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)
            
            for root, dirs, files in os.walk(temp_dir):
                # Filter directories in-place to avoid walking into ignored ones
                dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]
                
                for file in files:
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, temp_dir)
                    
                    if is_ignored_path(rel_path):
                        continue
                        
                    language = detect_language(file)
                    if not language:
                        continue
                        
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                    except UnicodeDecodeError:
                        continue # Skip non-text files
                        
                    size = os.path.getsize(file_path)
                    extracted_files.append({
                        "path": rel_path,
                        "language": language,
                        "size": size,
                        "content": content
                    })
    return extracted_files
