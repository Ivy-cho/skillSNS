import asyncio
import sys

# psycopg requires SelectorEventLoop on Windows (ProactorEventLoop is the default)
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8002)
