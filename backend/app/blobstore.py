
from pathlib import Path
import uuid
from .config import settings

BASE=Path(__file__).resolve().parents[2]/"data"/"blobstore"
BASE.mkdir(parents=True,exist_ok=True)

def save_bytes(user_id:str,category:str,filename:str,data:bytes,content_type:str="application/octet-stream")->dict:
    safe_name=Path(filename).name.replace("..","_")
    object_path=f"{user_id}/{category}/{uuid.uuid4()}_{safe_name}"

    if settings.storage_backend=="supabase":
        if not settings.supabase_url or not settings.supabase_service_key:
            raise RuntimeError("Supabase storage selected but credentials are missing.")
        from supabase import create_client
        client=create_client(settings.supabase_url,settings.supabase_service_key)
        client.storage.from_(settings.supabase_bucket).upload(
            path=object_path,
            file=data,
            file_options={"content-type":content_type,"upsert":"false"},
        )
        return {"backend":"supabase","path":object_path}

    dest=BASE/object_path
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_bytes(data)
    return {"backend":"local","path":str(dest)}

def signed_download_url(blob:dict,expires_seconds:int=300)->str|None:
    if blob.get("backend")!="supabase":
        return None
    from supabase import create_client
    client=create_client(settings.supabase_url,settings.supabase_service_key)
    res=client.storage.from_(settings.supabase_bucket).create_signed_url(blob["path"],expires_seconds)
    if isinstance(res,dict):
        return res.get("signedURL") or res.get("signed_url")
    return getattr(res,"signed_url",None)


def delete_prefix(user_id:str)->dict:
    """Delete all stored objects owned by a user."""
    if settings.storage_backend=="supabase":
        if not settings.supabase_url or not settings.supabase_service_key:
            raise RuntimeError("Supabase credentials missing.")
        from supabase import create_client
        client=create_client(settings.supabase_url,settings.supabase_service_key)
        bucket=client.storage.from_(settings.supabase_bucket)
        removed=0
        # Supabase list is folder scoped; categories currently used by RepairPilot.
        for category in ("images","manuals"):
            prefix=f"{user_id}/{category}"
            try:
                items=bucket.list(prefix)
                paths=[f"{prefix}/{x['name']}" for x in items if x.get("name")]
                if paths:
                    bucket.remove(paths); removed += len(paths)
            except Exception:
                pass
        return {"backend":"supabase","removed":removed}
    base=BASE/user_id
    import shutil
    if base.exists(): shutil.rmtree(base)
    return {"backend":"local","removed":"all"}
