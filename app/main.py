import asyncio
import os
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse

app = FastAPI(title="BHL Title Search")

BHL_API_URL = "https://www.biodiversitylibrary.org/api3"


def get_bhl_api_key() -> str:
    api_key = os.getenv("BHL_API_KEY", "").strip()

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="BHL_API_KEY is not configured.",
        )

    return api_key


def retry_after_seconds(value: str | None) -> float | None:
    if not value:
        return None

    value = value.strip()

    if value.isdigit():
        return float(value)

    try:
        retry_at = parsedate_to_datetime(value)

        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        return max((retry_at - now).total_seconds(), 0.0)
    except (TypeError, ValueError):
        return None


async def bhl_get(
    client: httpx.AsyncClient,
    params: dict[str, Any],
    error_message: str = "BHL API returned an error.",
) -> dict[str, Any]:
    request_params = {
        **params,
        "format": "json",
        "apikey": get_bhl_api_key(),
    }

    max_attempts = 3

    for attempt in range(1, max_attempts + 1):
        try:
            response = await client.get(BHL_API_URL, params=request_params)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            response = exc.response

            if response.status_code == 429 and attempt < max_attempts:
                retry_after = retry_after_seconds(response.headers.get("retry-after"))

                if retry_after is None:
                    retry_after = float(2 ** (attempt - 1))

                await asyncio.sleep(retry_after)
                continue

            raise HTTPException(
                status_code=502,
                detail={
                    "message": "BHL API request failed.",
                    "upstream_status_code": response.status_code,
                    "upstream_reason": response.reason_phrase,
                    "retry_after": response.headers.get("retry-after"),
                },
            )
        except httpx.RequestError:
            raise HTTPException(
                status_code=502,
                detail={
                    "message": "Could not connect to BHL API.",
                },
            )

        data: dict[str, Any] = response.json()

        if data.get("Status") != "ok":
            raise HTTPException(
                status_code=502,
                detail=data.get("ErrorMessage") or error_message,
            )

        return data

    raise HTTPException(
        status_code=502,
        detail={
            "message": "BHL API request failed after retrying.",
        },
    )


async def get_title_with_items(
    client: httpx.AsyncClient,
    title_id: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    data = await bhl_get(
        client,
        {
            "op": "GetTitleMetadata",
            "id": title_id,
            "idtype": "bhl",
            "items": "t",
        },
        error_message="BHL API returned an error while fetching the title.",
    )

    results = data.get("Result") or []

    if not results:
        raise HTTPException(
            status_code=404,
            detail="No BHL title found for that title_id.",
        )

    title = results[0]
    items = title.get("Items") or []

    return title, items


async def search_item_pages(
    client: httpx.AsyncClient,
    item_id: int,
    text: str,
) -> list[dict[str, Any]]:
    data = await bhl_get(
        client,
        {
            "op": "PageSearch",
            "itemid": item_id,
            "text": text,
        },
        error_message="BHL API returned an error while searching the item.",
    )

    return data.get("Result") or []


async def polite_bhl_pause() -> None:
    await asyncio.sleep(0.25)


def get_page_number(page: dict[str, Any]) -> str | None:
    page_numbers = page.get("PageNumbers") or []

    if not page_numbers:
        return None

    first_page_number = page_numbers[0]

    if not isinstance(first_page_number, dict):
        return None

    return first_page_number.get("Number")


def format_page_result(page: dict[str, Any]) -> dict[str, Any]:
    return {
        "page_id": page.get("PageID"),
        "page_number": get_page_number(page),
        "page_url": page.get("PageUrl"),
        "thumbnail_url": page.get("ThumbnailUrl"),
        "text_source": page.get("TextSource"),
    }


def format_title(title: dict[str, Any]) -> dict[str, Any]:
    return {
        "title_id": title.get("TitleID"),
        "full_title": title.get("FullTitle"),
        "short_title": title.get("ShortTitle"),
        "title_url": title.get("TitleUrl"),
    }


def format_item_summary(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "item_id": item.get("ItemID"),
        "volume": item.get("Volume"),
        "year": item.get("Year"),
        "item_url": item.get("ItemUrl"),
    }


@app.get("/", response_class=HTMLResponse)
def home() -> str:
    return """
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>BHL Title Search</title>
        <style>
          body {
            max-width: 760px;
            margin: 3rem auto;
            padding: 0 1rem;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            line-height: 1.5;
          }

          code {
            background: #f3f3f3;
            padding: 0.15rem 0.3rem;
            border-radius: 0.25rem;
          }

          a {
            color: inherit;
          }
        </style>
      </head>
      <body>
        <h1>BHL Title Search</h1>

        <p>
          This lightweight app will search across all volumes/items in a
          Biodiversity Heritage Library title.
        </p>

        <p>
          The backend API is running. The search interface will come next.
        </p>

        <h2>Current test links</h2>

        <ul>
          <li><a href="/api/ping">API ping</a></li>
          <li><a href="/api/bhl-title?title_id=61122">Example title metadata</a></li>
          <li><a href="/docs">Interactive API docs</a></li>
        </ul>

        <p>
          Current search endpoint:
          <code>/api/bhl-title-search?title_id=61122&amp;text=cat</code>
        </p>
      </body>
    </html>
    """


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/api/ping")
def api_ping():
    return {
        "ok": True,
        "app": "BHL Title Search",
        "api": "reachable",
    }


@app.get("/api/bhl-title")
async def bhl_title(
    title_id: int = Query(..., description="BHL title/publication ID"),
):
    async with httpx.AsyncClient(timeout=20.0) as client:
        title, items = await get_title_with_items(client, title_id)

    return {
        "ok": True,
        "source": "bhl",
        "title": format_title(title),
        "item_count": len(items),
        "items": [format_item_summary(item) for item in items],
    }


@app.get("/api/bhl-title-search")
async def bhl_title_search(
    title_id: int = Query(..., description="BHL title/publication ID"),
    text: str = Query(..., min_length=1, description="Text to search for"),
):
    async with httpx.AsyncClient(timeout=20.0) as client:
        title, items = await get_title_with_items(client, title_id)

        if not items:
            raise HTTPException(
                status_code=404,
                detail="That BHL title has no associated items.",
            )

        matching_items = []

        for index, item in enumerate(items):
            item_id = item.get("ItemID")

            if not item_id:
                continue

            if index > 0:
                await polite_bhl_pause()

            pages = await search_item_pages(client, item_id, text)

            if not pages:
                continue

            matching_items.append(
                {
                    **format_item_summary(item),
                    "match_count": len(pages),
                    "pages": [format_page_result(page) for page in pages],
                }
            )

    return {
        "ok": True,
        "source": "bhl",
        "mode": "all_items_sequential",
        "query": {
            "title_id": title_id,
            "text": text,
        },
        "title": format_title(title),
        "available_item_count": len(items),
        "searched_item_count": len(items),
        "matching_item_count": len(matching_items),
        "total_matches": sum(item["match_count"] for item in matching_items),
        "matching_items": matching_items,
    }
