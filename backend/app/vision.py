
import base64, json, mimetypes, os
from pathlib import Path
from .models import PhotoAnalysisResponse

def demo(filename:str, upload_id:str)->PhotoAnalysisResponse:
    return PhotoAnalysisResponse(
        upload_id=upload_id, filename=filename,
        description="Photo stored successfully. AI vision is not enabled, so no automatic component identification was attempted.",
        extracted_text=[], likely_objects=[],
        suggested_profile_updates={}, confidence=0
    )

def analyze_image(path:Path, filename:str, upload_id:str)->PhotoAnalysisResponse:
    key=os.getenv("OPENAI_API_KEY")
    if not key: return demo(filename,upload_id)

    from openai import OpenAI
    client=OpenAI(api_key=key)
    mime=mimetypes.guess_type(filename)[0] or "image/jpeg"
    data=base64.b64encode(path.read_bytes()).decode()

    schema={
      "type":"object","additionalProperties":False,
      "required":["description","extracted_text","likely_objects","suggested_profile_updates","confidence"],
      "properties":{
        "description":{"type":"string"},
        "extracted_text":{"type":"array","items":{"type":"string"}},
        "likely_objects":{"type":"array","items":{"type":"string"}},
        "suggested_profile_updates":{"type":"object","additionalProperties":{"type":"string"}},
        "confidence":{"type":"number","minimum":0,"maximum":1}
      }
    }
    resp=client.responses.create(
      model=os.getenv("REPAIRPILOT_VISION_MODEL",os.getenv("REPAIRPILOT_MODEL","gpt-5.5")),
      instructions="""Analyze this repair-equipment photo conservatively.
Identify visible equipment/components and readable nameplate text.
Do not invent model numbers, ratings, terminals, or hidden components.
Suggested profile fields may include manufacturer, model, serial, category, or name only when visible or strongly supported.
Return empty strings/arrays when uncertain.""",
      input=[{"role":"user","content":[
        {"type":"input_text","text":"Analyze this equipment photo for RepairPilot."},
        {"type":"input_image","image_url":f"data:{mime};base64,{data}"}
      ]}],
      text={"format":{"type":"json_schema","name":"photo_analysis","strict":True,"schema":schema}},
      max_output_tokens=900, store=False
    )
    j=json.loads(resp.output_text)
    return PhotoAnalysisResponse(upload_id=upload_id,filename=filename,**j)
