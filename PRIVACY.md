# Privacy Policy

**Last Updated**: October 19, 2026

This Privacy Policy describes how the MCP NewsAPI.ai server ("the Server", "we", "our")
handles data when you use it to connect your AI assistant to the NewsAPI.ai (Event
Registry) news API.

## 1. Overview

The MCP NewsAPI.ai server is an open-source Model Context Protocol (MCP) server that acts
as a bridge between AI assistants (like Claude) and the NewsAPI.ai API. This server runs
locally on your machine and does not operate any cloud services or remote servers that
process your data.

## 2. Data Collection

### 2.1 What Data We Collect

The Server requires and processes the following data:

- **NewsAPI.ai API Key**: Your personal API key, provided via the `NEWSAPI_AI_API_KEY`
  environment variable
- **API Request Data**: The search terms, entity URIs and filters you or your AI assistant
  send through the Server
- **API Response Data**: News articles, events, concepts and usage information returned by
  NewsAPI.ai

### 2.2 How Data is Collected

- The API key is read from your local environment variables when the Server starts
- Request and response data flows through the Server during runtime as you interact with
  your AI assistant
- No data is collected, transmitted, or stored by the Server beyond what is described in §4

## 3. Data Usage

### 3.1 How We Use Your Data

Your data is used exclusively for the following purposes:

- **API Authentication**: Your API key authenticates requests to NewsAPI.ai
- **Request Proxying**: The Server forwards your searches to the appropriate NewsAPI.ai
  endpoints
- **Response Delivery**: API responses are returned to your AI assistant for processing and
  presentation

### 3.2 What We Don't Do With Your Data

The Server does NOT:

- Store your API key, search queries or results
- Log API requests, responses, or your API key to disk
- Analyze, profile, or perform any secondary processing on your queries or the results
- Write any file to your machine

## 4. Data Storage and Retention

### 4.1 No Persistent Storage

The Server does not persist data. Request and response data is held in memory only for the
duration of a single API call and is discarded after the response is delivered.

### 4.2 Temporary Memory Usage

- Your API key is held in memory for the lifetime of the Server process
- A small in-memory counter per tool is kept for local rate limiting (tool name and
  timestamps only, no request content)

## 5. Data Sharing and Third-Party Access

### 5.1 NewsAPI.ai API

Your API key and your search queries are transmitted to:

- **Service**: NewsAPI.ai / Event Registry API
- **Purpose**: To fulfill your requests for news articles, events and trends
- **Endpoint**: `https://eventregistry.org/api/v1/...` (over HTTPS)
- **Privacy Policy**: NewsAPI.ai privacy policy (see https://newsapi.ai)

The API is operated by Event Registry d.o.o. and is subject to their own privacy policy and
terms of service. The API key is sent in the HTTPS request body, not in the URL.

### 5.2 No Other Third Parties

Your data is NOT shared with:

- The maintainers or contributors of this open-source project
- Any analytics services
- Any telemetry or error reporting services
- Any other third-party services or APIs

## 6. Your Responsibilities

As a user of this Server, you are responsible for:

- Keeping your NewsAPI.ai API key secure
- Complying with NewsAPI.ai's terms of use, including any restrictions on storing or
  redistributing article content
- Complying with applicable data protection laws (e.g. GDPR) for any personal data you
  process through this Server (for example, searches about named individuals)

## 7. Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be reflected in the
"Last Updated" date and, for material changes, noted in `CHANGELOG.md`.

## 8. Contact

For privacy-related questions, open an issue in this repository or contact
`hola@nubiia.es`.
