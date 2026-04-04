from google import genai
from google.genai import types
from fastapi import APIRouter, HTTPException, UploadFile
from app.config import settings

router = APIRouter()


@router.post("/parse-screenshot")
async def parse_screenshot(file: UploadFile) -> dict[str, str]:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()

    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            "Summarize the content of this screenshot concisely.",
            types.Part.from_bytes(data=image_bytes, mime_type=file.content_type),
        ],
    )

    return {"summary": response.text}
