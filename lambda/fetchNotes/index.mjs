import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDBClient();
const TABLE_NAME = process.env.DYNAMODB_TABLE;

export const handler = async () => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  };

  try {
    const result = await dynamo.send(
      new ScanCommand({ TableName: TABLE_NAME })
    );

    const notes = (result.Items || [])
      .map((item) => ({
        id: item.id.S,
        text: item.text.S,
        timestamp: Number(item.timestamp.N),
      }))
      .sort((a, b) => b.timestamp - a.timestamp); // most recent first

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(notes),
    };
  } catch (err) {
    console.error("fetchNotes error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
