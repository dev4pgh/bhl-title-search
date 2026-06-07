import asyncio
import json
import os
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

app = FastAPI(title="BHL Title Search")
templates = Jinja2Templates(directory="app/templates")
app.mount("/static", StaticFiles(directory="app/static"), name="static")

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


def make_snippet(text: str | None, search_text: str, radius: int = 160) -> str | None:
    if not text:
        return None

    normalized_text = " ".join(text.split())

    if not normalized_text:
        return None

    match = re.search(re.escape(search_text), normalized_text, flags=re.IGNORECASE)

    if not match:
        return normalized_text[: radius * 2]

    start = max(match.start() - radius, 0)
    end = min(match.end() + radius, len(normalized_text))

    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(normalized_text) else ""

    return f"{prefix}{normalized_text[start:end]}{suffix}"


def format_page_result(page: dict[str, Any], search_text: str) -> dict[str, Any]:
    page_id = page.get("PageID")

    return {
        "page_id": page_id,
        "page_number": get_page_number(page),
        "page_url": (
            f"https://www.biodiversitylibrary.org/page/{page_id}"
            if page_id
            else page.get("PageUrl")
        ),
        "text_url": page.get("OcrUrl"),
        "thumbnail_url": page.get("ThumbnailUrl"),
        "image_url": page.get("FullSizeImageUrl"),
        "snippet": make_snippet(page.get("OcrText"), search_text),
        "search_text": search_text,
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


def format_author_names(publication: dict[str, Any]) -> list[str]:
    authors = publication.get("Authors") or []

    names = []

    for author in authors:
        name = author.get("Name")

        if name:
            names.append(name)

    return names


def format_title_candidate(publication: dict[str, Any]) -> dict[str, Any]:
    return {
        "title_id": publication.get("TitleID"),
        "title": publication.get("Title"),
        "title_url": publication.get("TitleUrl"),
        "genre": publication.get("Genre"),
        "date": publication.get("Date"),
        "authors": format_author_names(publication),
        "item_id": publication.get("ItemID"),
        "item_url": publication.get("ItemUrl"),
        "volume": publication.get("Volume"),
    }


def sse_event(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@app.get("/")
def home(request: Request):
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "example_title_id": "",
            "example_text": "",
        },
    )


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


@app.get("/api/bhl-title-lookup")
async def bhl_title_lookup(
    title: str = Query(
        ..., min_length=2, description="Publication title to search for"
    ),
):
    async with httpx.AsyncClient(timeout=20.0) as client:
        data = await bhl_get(
            client,
            {
                "op": "PublicationSearchAdvanced",
                "title": title,
                "titleop": "all",
                "page": 1,
                "pageSize": 20,
            },
            error_message="BHL API returned an error while searching titles.",
        )

    publications = data.get("Result") or []

    candidates_by_title_id = {}
    for publication in publications:
        title_id = publication.get("TitleID")

        if not title_id:
            continue

        if title_id not in candidates_by_title_id:
            candidates_by_title_id[title_id] = format_title_candidate(publication)

    return {
        "ok": True,
        "source": "bhl",
        "query": {
            "title": title,
        },
        "candidate_count": len(candidates_by_title_id),
        "candidates": list(candidates_by_title_id.values()),
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
                    "pages": [format_page_result(page, text) for page in pages],
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


@app.get("/api/bhl-title-search-stream")
async def bhl_title_search_stream(
    title_id: int = Query(..., description="BHL title/publication ID"),
    text: str = Query(..., min_length=1, description="Text to search for"),
):
    async def stream_search():
        searched_item_count = 0
        matching_item_count = 0
        total_matches = 0

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                title, items = await get_title_with_items(client, title_id)

                if not items:
                    yield sse_event(
                        "error",
                        {
                            "message": "That BHL title has no associated items.",
                        },
                    )
                    return

                yield sse_event(
                    "start",
                    {
                        "ok": True,
                        "source": "bhl",
                        "mode": "all_items_streaming",
                        "query": {
                            "title_id": title_id,
                            "text": text,
                        },
                        "title": format_title(title),
                        "available_item_count": len(items),
                    },
                )

                for index, item in enumerate(items):
                    item_id = item.get("ItemID")

                    if not item_id:
                        continue

                    if index > 0:
                        await polite_bhl_pause()

                    pages = await search_item_pages(client, item_id, text)
                    searched_item_count += 1

                    if pages:
                        formatted_item = {
                            **format_item_summary(item),
                            "match_count": len(pages),
                            "pages": [format_page_result(page, text) for page in pages],
                        }

                        matching_item_count += 1
                        total_matches += len(pages)

                        yield sse_event(
                            "item",
                            {
                                "item": formatted_item,
                                "searched_item_count": searched_item_count,
                                "available_item_count": len(items),
                                "matching_item_count": matching_item_count,
                                "total_matches": total_matches,
                            },
                        )

                    yield sse_event(
                        "progress",
                        {
                            "searched_item_count": searched_item_count,
                            "available_item_count": len(items),
                            "matching_item_count": matching_item_count,
                            "total_matches": total_matches,
                        },
                    )

                yield sse_event(
                    "done",
                    {
                        "ok": True,
                        "searched_item_count": searched_item_count,
                        "available_item_count": len(items),
                        "matching_item_count": matching_item_count,
                        "total_matches": total_matches,
                    },
                )

        except HTTPException as exc:
            yield sse_event(
                "error",
                {
                    "message": "Search failed.",
                    "detail": exc.detail,
                },
            )

        except Exception:
            yield sse_event(
                "error",
                {
                    "message": "Search failed unexpectedly.",
                },
            )

    return StreamingResponse(
        stream_search(),
        media_type="text/event-stream",
    )
