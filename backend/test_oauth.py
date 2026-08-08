import asyncio
import httpx
from bs4 import BeautifulSoup
import re

async def main():
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        try:
            # 1. Get the state cookie
            res1 = await client.get("/auth/github/login", follow_redirects=False)
            cookie = res1.cookies.get("github_oauth_state")
            state_match = re.search(r'state=([^&]+)', res1.headers.get('location', ''))
            state = state_match.group(1) if state_match else None
            
            print(f"Cookie: {cookie}")
            print(f"State: {state}")
            
            # 2. Hit the callback with fake code
            res2 = await client.get(f"/auth/github/callback?code=FAKE_CODE_123&state={state}", cookies={"github_oauth_state": cookie})
            print(f"Status: {res2.status_code}")
            print(f"Response: {res2.text}")
        except Exception as e:
            print(f"Error: {e}")

asyncio.run(main())
