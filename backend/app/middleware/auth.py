from fastapi import Request, HTTPException, Depends
from app.db.supabase import get_client

async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization token")
    
    token = auth_header.replace("Bearer ", "")
    supabase = get_client()
    
    response = supabase.auth.get_user(token)
    if not response or not response.user:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    user_id = response.user.id
    
    profile_response = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    if not profile_response.data:
        raise HTTPException(status_code=404, detail="User profile not found")
        
    return profile_response.data

def require_role(*roles: str):
    async def role_checker(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {', '.join(roles)}")
        return user
    return role_checker
