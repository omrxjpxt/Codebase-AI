import os
import zipfile
import tempfile
import shutil
import logging

logger = logging.getLogger(__name__)

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

MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024  # 200MB max per file
MAX_TOTAL_UNCOMPRESSED_BYTES = 500 * 1024 * 1024  # 500MB total
MAX_TOTAL_FILES = 10000

def is_safe_zip_path(base_dir: str, member_name: str) -> bool:
    """
    Validates that member_name resolves strictly within base_dir.
    Rejects:
    - Path traversal with ../ or ..\\
    - Absolute paths (/foo, \\foo, C:\\foo)
    - Null bytes or control characters
    - Canonical path escapes outside base_dir
    """
    if not member_name or '\0' in member_name:
        return False
        
    normalized = member_name.replace('\\', '/')
    
    # Disallow absolute paths (Unix leading slash or Windows drive letters like C:)
    if normalized.startswith('/'):
        return False
    if len(normalized) >= 2 and normalized[1] == ':':
        return False
    # Disallow UNC paths (e.g. //server/share)
    if normalized.startswith('//'):
        return False
        
    segments = [s for s in normalized.split('/') if s]
    if any(s == '..' for s in segments):
        return False
        
    base_abs = os.path.abspath(base_dir)
    target_abs = os.path.abspath(os.path.join(base_abs, *segments))
    
    # Target must be strictly inside base_abs or equal to base_abs
    common = os.path.commonpath([base_abs, target_abs])
    return common == base_abs

def is_zip_symlink(member: zipfile.ZipInfo) -> bool:
    """Returns True if the ZipInfo entry represents a symbolic link."""
    # UNIX symlink mode check in external_attr (0o120000 = S_IFLNK)
    return ((member.external_attr >> 16) & 0o170000) == 0o120000

def detect_archive_wrapper_dir(namelist: list[str]) -> str | None:
    """
    Detect if an archive has a single top-level wrapper directory (standard in GitHub zipball downloads: {owner}-{repo}-{commit}/).
    Returns the wrapper directory name if every legitimate file/dir is nested inside it, otherwise None.
    """
    meaningful_names = [
        n.replace('\\', '/').strip('/')
        for n in namelist
        if n and not n.startswith('__MACOSX/') and not n.startswith('.')
    ]
    if not meaningful_names:
        return None
        
    first_parts = set()
    for name in meaningful_names:
        parts = [p for p in name.split('/') if p]
        if parts:
            first_parts.add(parts[0])
            
    # If all entries belong to the exact same single top-level directory
    if len(first_parts) == 1:
        wrapper = list(first_parts)[0]
        # Only treat as wrapper if there are actual files or subdirectories underneath it
        has_children = any(
            len(name.split('/')) > 1 for name in meaningful_names
        )
        if has_children:
            return wrapper
            
    return None

def normalize_file_path(rel_path: str, wrapper_dir: str | None = None) -> str:
    """
    Normalizes a relative file path:
    - Converts backslashes to forward slashes.
    - Strips the detected archive wrapper directory segment if present.
    - Strips leading and trailing slashes.
    """
    normalized = rel_path.replace('\\', '/').strip('/')
    if wrapper_dir:
        wrapper_prefix = f"{wrapper_dir.strip('/')}/"
        if normalized.startswith(wrapper_prefix):
            normalized = normalized[len(wrapper_prefix):]
    return normalized

def is_ignored_path(path: str) -> bool:
    normalized = path.replace('\\', '/')
    parts = normalized.split('/')
    for part in parts:
        if part in IGNORE_DIRS or part.startswith('.'):
            if part not in {".env.example", ".gitignore"}:
                return True
    return False

def detect_language(filename: str) -> str | None:
    _, ext = os.path.splitext(filename)
    return SUPPORTED_EXTENSIONS.get(ext.lower())

def extract_and_scan_zip(zip_filepath: str) -> list[dict]:
    extracted_files = []
    
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            with zipfile.ZipFile(zip_filepath, 'r') as zip_ref:
                # 1. Detect wrapper directory (e.g. GitHub zipball wrapper: owner-repo-sha/)
                wrapper_dir = detect_archive_wrapper_dir(zip_ref.namelist())
                if wrapper_dir:
                    logger.info(f"Detected archive wrapper directory: {wrapper_dir}")
                    
                total_uncompressed = 0
                file_count = 0
                
                # 2. Extract each member safely
                for member in zip_ref.infolist():
                    # Skip directory entries
                    if member.is_dir() or member.filename.endswith('/') or member.filename.endswith('\\'):
                        continue
                        
                    # Skip symlinks
                    if is_zip_symlink(member):
                        logger.warning(f"Skipping symlink in archive: {member.filename}")
                        continue
                        
                    # Validate against Zip-Slip traversal
                    if not is_safe_zip_path(temp_dir, member.filename):
                        logger.warning(f"Blocked Zip-Slip path traversal attempt: {member.filename}")
                        continue
                        
                    # Check limits
                    file_count += 1
                    if file_count > MAX_TOTAL_FILES:
                        logger.warning(f"Archive exceeded max file count limit ({MAX_TOTAL_FILES}). Truncating extraction.")
                        break
                        
                    if member.file_size > MAX_FILE_SIZE_BYTES:
                        logger.warning(f"Skipping file exceeding size limit ({member.file_size} bytes): {member.filename}")
                        continue
                        
                    total_uncompressed += member.file_size
                    if total_uncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES:
                        logger.warning(f"Archive exceeded total uncompressed limit ({MAX_TOTAL_UNCOMPRESSED_BYTES} bytes). Truncating extraction.")
                        break
                        
                    # Safe sanitized target destination
                    sanitized_rel = member.filename.replace('\\', '/')
                    target_path = os.path.join(temp_dir, *[s for s in sanitized_rel.split('/') if s and s != '.'])
                    
                    os.makedirs(os.path.dirname(target_path), exist_ok=True)
                    with zip_ref.open(member) as source, open(target_path, 'wb') as target:
                        shutil.copyfileobj(source, target)
        except zipfile.BadZipFile:
            raise ValueError("Invalid or corrupted ZIP archive.")
        except zipfile.LargeZipFile:
            raise ValueError("ZIP archive exceeds standard limits and requires ZIP64 support.")
                    
        # 3. Scan extracted files
        for root, dirs, files in os.walk(temp_dir):
            # Filter directories in-place to avoid walking into ignored ones
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]
            
            for file in files:
                file_path = os.path.join(root, file)
                raw_rel_path = os.path.relpath(file_path, temp_dir)
                
                # Normalize path (convert to forward slashes and strip wrapper directory)
                rel_path = normalize_file_path(raw_rel_path, wrapper_dir)
                
                if is_ignored_path(rel_path):
                    continue
                    
                language = detect_language(file)
                if not language:
                    continue
                    
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                except UnicodeDecodeError:
                    continue  # Skip non-text/binary files
                    
                size = os.path.getsize(file_path)
                extracted_files.append({
                    "path": rel_path,
                    "language": language,
                    "size": size,
                    "content": content
                })
                
    return extracted_files
