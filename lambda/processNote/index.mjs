import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDBClient();
const TABLE_NAME = process.env.DYNAMODB_TABLE;

export const handler = async (event) => {
  for (const record of event.Records) {
    const note = JSON.parse(record.body);

    console.log("Processing note:", note.id);

    await dynamo.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          id: { S: note.id },
          text: { S: note.text },
          timestamp: { N: String(note.timestamp) },
        },
      })
    );

    console.log("Saved note:", note.id);
  }
};
