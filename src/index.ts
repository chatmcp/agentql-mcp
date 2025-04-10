#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';
import { getParamValue, getAuthValue } from "@chatmcp/sdk/utils/index.js";
import { RestServerTransport } from "@chatmcp/sdk/server/rest.js";

// Interface for parsing AQL REST API response.
interface AqlResponse {
  data: object;
}

// Create an MCP server with only tools capability (trigger 'query-data' call).
const server = new Server(
  {
    name: 'agentql-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const EXTRACT_TOOL_NAME = 'extract-web-data';
// const AGENTQL_API_KEY = process.env.AGENTQL_API_KEY;

// if (!AGENTQL_API_KEY) {
//   console.error('Error: AGENTQL_API_KEY environment variable is required');
//   process.exit(1);
// }
const agentqlApiKey = getParamValue("agentql_api_key") || "";
 
const mode = getParamValue("mode") || "stdio";
const port = getParamValue("port") || 9593;
const endpoint = getParamValue("endpoint") || "/rest";

// Handler that lists available tools.
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: EXTRACT_TOOL_NAME,
        description:
          'Extracts structured data as JSON from a web page given a URL using a Natural Language description of the data.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL of the public webpage to extract data from',
            },
            prompt: {
              type: 'string',
              description: 'Natural Language description of the data to extract from the page',
            },
          },
          required: ['url', 'prompt'],
        },
      },
    ],
  };
});

// Handler for the 'extract-web-data' tool.
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const apiKey = getAuthValue(request, "AGENTQL_API_KEY") || agentqlApiKey;
  if (!apiKey) {
    throw new Error("AGENTQL_API_KEY not set");
  }

  switch (request.params.name) {
    case EXTRACT_TOOL_NAME: {
      const url = String(request.params.arguments?.url);
      const prompt = String(request.params.arguments?.prompt);
      if (!url || !prompt) {
        throw new Error("Both 'url' and 'prompt' are required");
      }

      const endpoint = 'https://api.agentql.com/v1/query-data';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'X-API-Key': `${apiKey}`,
          'X-TF-Request-Origin': 'mcp-server',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url,
          prompt: prompt,
          params: {
            wait_for: 0,
            is_scroll_to_bottom_enabled: false,
            mode: 'fast',
            is_screenshot_enabled: false,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`AgentQL API error: ${response.statusText}\n${await response.text()}`);
      }

      const json = (await response.json()) as AqlResponse;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(json.data, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: '${request.params.name}'`);
  }
});

// Start the server using stdio transport.
async function main() {
  if (mode === "rest") {
    const transport = new RestServerTransport({
      port,
      endpoint,
    });
    await server.connect(transport);

    await transport.startServer();

    return;
  }
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
