import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient();
const QUEUE_URL = process.env.SQS_QUEUE_URL;

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // Support both proxy integration (event.body is a JSON string)
    // and non-proxy integration (body fields are directly on event)
    const body = event.body
      ? typeof event.body === "string" ? JSON.parse(event.body) : event.body
      : event;
    const text = (body.text || "").trim();

    if (!text || text.length > 280) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Note text is required (max 280 chars)." }),
      };
    }

    const note = {
      id: crypto.randomUUID(),
      text,
      timestamp: Date.now(),
    };

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify(note),
      })
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "Note queued", id: note.id }),
    };
  } catch (err) {
    console.error("enqueueNote error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
