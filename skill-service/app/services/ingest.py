import io

import httpx
import trafilatura
from docx import Document
from pypdf import PdfReader

MAX_CHARS = 20_000
FETCH_TIMEOUT = 10.0
MAX_FILE_BYTES = 5 * 1024 * 1024


class IngestError(Exception):
    pass


def parse_pdf_bytes(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return text[:MAX_CHARS]


def parse_docx_bytes(data: bytes) -> str:
    doc = Document(io.BytesIO(data))
    text = "\n".join(p.text for p in doc.paragraphs)
    return text[:MAX_CHARS]


def parse_text_bytes(data: bytes) -> str:
    return data.decode("utf-8", errors="ignore")[:MAX_CHARS]


async def fetch_url_text(url: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "skillSNS-bot/1.0"})
            resp.raise_for_status()
    except httpx.HTTPError as e:
        raise IngestError(f"링크를 가져오지 못했습니다 ({e})") from e

    content_type = resp.headers.get("content-type", "")
    if "pdf" in content_type:
        text = parse_pdf_bytes(resp.content)
    else:
        text = trafilatura.extract(resp.text, include_comments=False, include_tables=False) or resp.text

    text = text.strip()
    if not text:
        raise IngestError("페이지에서 텍스트를 추출하지 못했습니다.")
    return text[:MAX_CHARS]


async def ingest_file(filename: str, data: bytes) -> str:
    if len(data) > MAX_FILE_BYTES:
        raise IngestError("파일이 너무 큽니다 (5MB 제한).")

    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext == "pdf":
        text = parse_pdf_bytes(data)
    elif ext == "docx":
        text = parse_docx_bytes(data)
    elif ext in ("txt", "md"):
        text = parse_text_bytes(data)
    else:
        raise IngestError(f"지원하지 않는 파일 형식입니다 (.{ext}).")

    if not text.strip():
        raise IngestError("파일에서 텍스트를 추출하지 못했습니다.")
    return text
