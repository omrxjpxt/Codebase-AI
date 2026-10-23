import os
import io
import zipfile
import tempfile
import pytest

from app.services.file_processor import (
    is_safe_zip_path,
    is_zip_symlink,
    detect_archive_wrapper_dir,
    normalize_file_path,
    extract_and_scan_zip
)


def test_is_safe_zip_path_validation():
    with tempfile.TemporaryDirectory() as base_dir:
        # Legitimate paths
        assert is_safe_zip_path(base_dir, "main.py") is True
        assert is_safe_zip_path(base_dir, "src/index.ts") is True
        assert is_safe_zip_path(base_dir, "src/components/ui/Button.tsx") is True
        assert is_safe_zip_path(base_dir, "nested/deeply/nested/file.py") is True

        # Traversal attempts
        assert is_safe_zip_path(base_dir, "../evil.py") is False
        assert is_safe_zip_path(base_dir, "../../etc/passwd") is False
        assert is_safe_zip_path(base_dir, "src/../../evil.py") is False
        assert is_safe_zip_path(base_dir, "src/nested/../../../evil.py") is False

        # Windows-style traversal
        assert is_safe_zip_path(base_dir, "..\\evil.py") is False
        assert is_safe_zip_path(base_dir, "..\\..\\windows\\system32\\calc.exe") is False
        assert is_safe_zip_path(base_dir, "src\\..\\..\\evil.py") is False

        # Absolute paths
        assert is_safe_zip_path(base_dir, "/etc/passwd") is False
        assert is_safe_zip_path(base_dir, "/tmp/evil.py") is False
        assert is_safe_zip_path(base_dir, "C:\\evil.py") is False
        assert is_safe_zip_path(base_dir, "D:/evil.py") is False
        assert is_safe_zip_path(base_dir, "//server/share/evil.py") is False

        # Null bytes or invalid characters
        assert is_safe_zip_path(base_dir, "safe\0evil.py") is False
        assert is_safe_zip_path(base_dir, "") is False


def test_symlink_detection():
    # Regular file ZipInfo
    reg_info = zipfile.ZipInfo("file.py")
    reg_info.external_attr = 0o644 << 16
    assert is_zip_symlink(reg_info) is False

    # Symlink ZipInfo (UNIX mode 0o120777)
    sym_info = zipfile.ZipInfo("symlink_to_passwd")
    sym_info.external_attr = (0o120777) << 16
    assert is_zip_symlink(sym_info) is True


def test_detect_archive_wrapper_dir():
    # 1. Standard GitHub zipball layout: all files nested under owner-repo-sha/
    github_names = [
        "octocat-Hello-World-7fd1a60/",
        "octocat-Hello-World-7fd1a60/README.md",
        "octocat-Hello-World-7fd1a60/src/main.py",
        "octocat-Hello-World-7fd1a60/src/utils.py"
    ]
    assert detect_archive_wrapper_dir(github_names) == "octocat-Hello-World-7fd1a60"

    # 2. Multi-root layout: src/ and docs/ -> No single wrapper
    multi_root = [
        "src/main.py",
        "src/utils.py",
        "docs/readme.md"
    ]
    assert detect_archive_wrapper_dir(multi_root) is None

    # 3. Flat layout: files at root -> No wrapper
    flat_names = [
        "README.md",
        "main.py",
        "package.json"
    ]
    assert detect_archive_wrapper_dir(flat_names) is None

    # 4. Empty archive
    assert detect_archive_wrapper_dir([]) is None


def test_normalize_file_path():
    wrapper = "owner-repo-7fd1a60"
    
    # Strip wrapper directory
    assert normalize_file_path("owner-repo-7fd1a60/src/main.py", wrapper) == "src/main.py"
    assert normalize_file_path("owner-repo-7fd1a60/README.md", wrapper) == "README.md"
    
    # Windows-style backslashes
    assert normalize_file_path("owner-repo-7fd1a60\\src\\utils.py", wrapper) == "src/utils.py"
    
    # No wrapper provided
    assert normalize_file_path("src/main.py", None) == "src/main.py"
    assert normalize_file_path("src\\main.py", None) == "src/main.py"


def test_extract_and_scan_zip_blocks_zip_slip_and_preserves_valid():
    with tempfile.TemporaryDirectory() as test_dir:
        zip_path = os.path.join(test_dir, "mixed_payload.zip")
        canary_outside_path = os.path.join(test_dir, "escaped_canary.txt")

        # Create malicious zip archive
        with zipfile.ZipFile(zip_path, "w") as zf:
            # 1. Valid file
            zf.writestr("src/app.py", "def run():\n    return 'safe'\n")
            
            # 2. Legitimate nested file
            zf.writestr("src/components/Header.tsx", "export const Header = () => null;\n")

            # 3. Zip-Slip attempt with relative traversal
            zf.writestr("../../escaped_canary.txt", "MALICIOUS PAYLOAD OUTSIDE ROOT")

            # 4. Zip-Slip with Windows-style backslash traversal
            zf.writestr("..\\..\\win_escaped.txt", "MALICIOUS WINDOWS ESCAPE")

            # 5. Zip-Slip with absolute path
            zf.writestr("/tmp/abs_escaped.py", "ABSOLUTE ESCAPE")

            # 6. Symlink entry attempting to point to outside
            sym_info = zipfile.ZipInfo("evil_symlink.py")
            sym_info.external_attr = 0o120777 << 16
            zf.writestr(sym_info, "/etc/passwd")

        # Execute extraction
        extracted = extract_and_scan_zip(zip_path)

        # 1. Verify canary was NOT created outside the extraction root
        assert not os.path.exists(canary_outside_path)
        assert not os.path.exists(os.path.join(test_dir, "win_escaped.txt"))

        # 2. Verify legitimate files WERE safely extracted
        extracted_paths = [f["path"] for f in extracted]
        assert "src/app.py" in extracted_paths
        assert "src/components/Header.tsx" in extracted_paths

        # 3. Verify malicious entries were rejected and excluded
        assert not any("canary" in p for p in extracted_paths)
        assert not any("escaped" in p for p in extracted_paths)
        assert not any("symlink" in p for p in extracted_paths)

        # 4. Verify contents of valid files
        app_file = next(f for f in extracted if f["path"] == "src/app.py")
        assert app_file["language"] == "Python"
        assert "def run():" in app_file["content"]


def test_extract_and_scan_github_archive_normalizes_wrapper():
    with tempfile.TemporaryDirectory() as test_dir:
        zip_path = os.path.join(test_dir, "github_repo.zip")

        # Create zip with standard GitHub wrapper directory: owner-repo-commit/
        wrapper = "testowner-myproject-9ab12cd"
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr(f"{wrapper}/README.md", "# My Project\n\nOverview here.\n")
            zf.writestr(f"{wrapper}/src/index.ts", "console.log('hello');\n")
            zf.writestr(f"{wrapper}/package.json", '{"name": "myproject"}\n')

        extracted = extract_and_scan_zip(zip_path)
        extracted_paths = sorted([f["path"] for f in extracted])

        # Verify the wrapper directory was stripped cleanly
        assert extracted_paths == ["README.md", "package.json", "src/index.ts"]
        assert all(not p.startswith(wrapper) for p in extracted_paths)
        assert all("/" in p or "." in p for p in extracted_paths)
