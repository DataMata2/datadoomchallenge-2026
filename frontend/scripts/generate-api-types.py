"""Generate transport types from the reviewed local OpenAPI schema (no network)."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
schemas = json.loads((root / "docs/openapi.json").read_text())["components"]["schemas"]

def ts(node):
    if "$ref" in node:
        return node["$ref"].split("/")[-1]
    if "const" in node:
        return json.dumps(node["const"])
    if "enum" in node:
        return " | ".join(json.dumps(item) for item in node["enum"])
    if "anyOf" in node:
        return " | ".join(ts(item) for item in node["anyOf"])
    kind = node.get("type")
    if kind == "array":
        return f"Array<{ts(node['items'])}>"
    if kind == "object":
        props = node.get("properties", {})
        required = node.get("required", [])
        if props:
            return "{\n" + "\n".join(f"  {json.dumps(key)}{'' if key in required else '?'}: {ts(value)};" for key, value in props.items()) + "\n}"
        extra = node.get("additionalProperties")
        return f"Record<string, {ts(extra) if isinstance(extra, dict) else 'unknown'}>"
    return {"string": "string", "integer": "number", "number": "number", "boolean": "boolean", "null": "null"}.get(kind, "unknown")

output = "// Generated from docs/openapi.json. Run npm run generate:types after API changes.\n"
output += "\n\n".join(f"export type {name} = {ts(schema)};" for name, schema in schemas.items()) + "\n"
(root / "frontend/src/api-types.ts").write_text(output)
