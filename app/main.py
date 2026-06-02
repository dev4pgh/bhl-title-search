import os
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query

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

    try:
        response = await client.get(BHL_API_URL, params=request_params)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach BHL API: {exc}",
        )

    data: dict[str, Any] = response.json()

    if data.get("Status") != "ok":
        raise HTTPException(
            status_code=502,
            detail=data.get("ErrorMessage") or error_message,
        )

    return data


@app.get("/")
def home():
    return {
        "app": "BHL Title Search",
        "status": "running",
        "message": "FastAPI is working.",
    }


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/api/ping")
def api_ping():
    return {"ok": True, "app": "BHL Title Search", "api": "reachable"}


@app.get("/api/bhl-title")
async def bhl_title(
    title_id: int = Query(..., description="BHL title/publication ID"),
):
    async with httpx.AsyncClient(timeout=20.0) as client:
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

    result = data.get("Result") or []

    if not result:
        raise HTTPException(
            status_code=404,
            detail="No BHL title found for that title_id.",
        )

    title = result[0]
    items = title.get("Items") or []

    return {
        "ok": True,
        "source": "bhl",
        "title": {
            "title_id": title.get("TitleID"),
            "full_title": title.get("FullTitle"),
            "short_title": title.get("ShortTitle"),
            "title_url": title.get("TitleUrl"),
        },
        "item_count": len(items),
        "first_items": items[:5],
    }


@app.get("/api/bhl-page-search")
async def bhl_page_search(
    item_id: int = Query(..., description="BHL item/volume ID"),
    text: str = Query(..., min_length=1, description="Text to search for"),
):
    async with httpx.AsyncClient(timeout=20.0) as client:
        data = await bhl_get(
            client,
            {
                "op": "PageSearch",
                "itemid": item_id,
                "text": text,
            },
            error_message="BHL API returned an error while searching the item.",
        )

    pages = data.get("Result") or []

    return {
        "ok": True,
        "source": "bhl",
        "query": {
            "item_id": item_id,
            "text": text,
        },
        "match_count": len(pages),
        "first_pages": pages[:5],
    }


@app.get("/api/bhl-title-first-item-search")
async def bhl_title_first_item_search(
    title_id: int = Query(..., description="HBL title/publication ID"),
    text: str = Query(..., min_length=1, description="Text to search for"),
):
    async with httpx.AsyncClient(timeout=20.0) as client:
        title_data = await bhl_get(
            client,
            {
                "op": "GetTitleMetadata",
                "id": title_id,
                "idtype": "bhl",
                "items": "t",
            },
            error_message="BHL API returned an error while fetching the title.",
        )

        title_results = title_data.get("Result") or []

        if not title_results:
            raise HTTPException(
                status_code=404,
                detail="No BHL title found for that title_id.",
            )

        title = title_results[0]
        items = title.get("Items") or []

        if not items:
            raise HTTPException(
                status_code=404,
                detail="That BHL title has no associated items.",
            )

        first_item = items[0]
        item_id = first_item.get("ItemID")

        page_search_data = await bhl_get(
            client,
            {
                "op": "PageSearch",
                "itemid": item_id,
                "text": text,
            },
            error_message="BHL API returned an error while searching the first item.",
        )

    pages = page_search_data.get("Result") or []

    return {
        "ok": True,
        "source": "bhl",
        "mode": "first_item_only",
        "query": {
            "title_id": title_id,
            "text": text,
        },
        "title": {
            "title_id": title.get("TitleID"),
            "full_title": title.get("FullTitle"),
            "title_url": title.get("TitleUrl"),
        },
        "searched_item": {
            "item_id": item_id,
            "volume": first_item.get("Volume"),
            "year": first_item.get("Year"),
            "item_url": first_item.get("ItemURL"),
        },
        "available_item_count": len(items),
        "match_count": len(pages),
        "first_pages": pages[:5],
    }
