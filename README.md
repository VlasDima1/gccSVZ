Simple Notes App — A minimal serverless web application on AWS demonstrating S3 static hosting, API Gateway, Lambda (Node.js), SQS message queuing, and DynamoDB storage. Users submit short text notes through a browser UI; notes flow through an SQS queue, are processed by a Lambda function, and stored in DynamoDB. No authentication, no frameworks — just a clean, working example of an event-driven AWS architecture.

https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#logsV2:log-groups

http://notes-app-gcc-12345.s3-website.eu-central-1.amazonaws.com/
