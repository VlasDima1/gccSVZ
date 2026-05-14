# Deploying the Simple Notes App on AWS

This guide walks you through deploying every component using the **AWS Management Console**. You can also use the AWS CLI — equivalent commands are shown where helpful.

> **Prerequisites:** An AWS account and the AWS CLI configured (`aws configure`).

---

## Architecture Overview

```
Browser → S3 (static site)
              ↓ fetch()
         API Gateway
        /            \
  POST /notes      GET /notes
       ↓                ↓
  enqueueNote λ    fetchNotes λ → DynamoDB (scan)
       ↓
      SQS
       ↓
  processNote λ → DynamoDB (put)
```

---

## Step 1 — Create the DynamoDB Table

1. Open **DynamoDB** in the AWS Console.
2. Click **Create table**.
3. Set:
   - **Table name:** `NotesTable`
   - **Partition key:** `id` (String)
4. Leave everything else as default (on-demand capacity is fine).
5. Click **Create table**.

**CLI:**
```bash
aws dynamodb create-table \
  --table-name NotesTable \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

---

## Step 2 — Create the SQS Queue

1. Open **SQS** in the AWS Console.
2. Click **Create queue**.
3. Set:
   - **Type:** Standard
   - **Name:** `NotesQueue`
4. Leave defaults, click **Create queue**.
5. **Copy the Queue URL** — you will need it later (looks like `https://sqs.us-east-1.amazonaws.com/123456789012/NotesQueue`).

**CLI:**
```bash
aws sqs create-queue --queue-name NotesQueue
# Note the QueueUrl from the output
```

---

## Step 3 — Create an IAM Role for Lambda

All three Lambda functions can share one role.

1. Open **IAM → Roles → Create role**.
2. **Trusted entity:** AWS service → **Lambda**.
3. Attach these **managed policies**:
   - `AWSLambdaBasicExecutionRole` (CloudWatch Logs)
   - `AmazonDynamoDBFullAccess` (or a scoped-down policy for `NotesTable`)
   - `AmazonSQSFullAccess` (or scoped to `NotesQueue`)
4. **Role name:** `NotesAppLambdaRole`
5. Click **Create role**.
6. **Copy the Role ARN** (e.g. `arn:aws:iam::123456789012:role/NotesAppLambdaRole`).

**CLI:**
```bash
# Create trust policy file
cat > trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name NotesAppLambdaRole \
  --assume-role-policy-document file://trust-policy.json

aws iam attach-role-policy --role-name NotesAppLambdaRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam attach-role-policy --role-name NotesAppLambdaRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess
aws iam attach-role-policy --role-name NotesAppLambdaRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonSQSFullAccess
```

---

## Step 4 — Deploy the Lambda Functions

### 4a. Package each function

From the project root:

```bash
# enqueueNote
cd lambda/enqueueNote
zip -j enqueueNote.zip index.mjs
cd ../..

# processNote
cd lambda/processNote
zip -j processNote.zip index.mjs
cd ../..

# fetchNotes
cd lambda/fetchNotes
zip -j fetchNotes.zip index.mjs
cd ../..
```

### 4b. Create the functions

Replace `<ROLE_ARN>` with the ARN from Step 3, and `<QUEUE_URL>` with the URL from Step 2.

**In the Console:**

For each function, go to **Lambda → Create function → Author from scratch**:

| Setting | enqueueNote | processNote | fetchNotes |
|---|---|---|---|
| Function name | `enqueueNote` | `processNote` | `fetchNotes` |
| Runtime | Node.js 20.x | Node.js 20.x | Node.js 20.x |
| Architecture | x86_64 | x86_64 | x86_64 |
| Execution role | `NotesAppLambdaRole` | `NotesAppLambdaRole` | `NotesAppLambdaRole` |

After creation, upload the corresponding `.zip` file under **Code → Upload from → .zip file**.

Then set **Environment variables** (Configuration → Environment variables):

| Function | Variable | Value |
|---|---|---|
| enqueueNote | `SQS_QUEUE_URL` | `<QUEUE_URL>` |
| processNote | `DYNAMODB_TABLE` | `NotesTable` |
| fetchNotes | `DYNAMODB_TABLE` | `NotesTable` |

**CLI:**
```bash
ROLE_ARN="arn:aws:iam::123456789012:role/NotesAppLambdaRole"
QUEUE_URL="https://sqs.us-east-1.amazonaws.com/123456789012/NotesQueue"

aws lambda create-function \
  --function-name enqueueNote \
  --runtime nodejs20.x \
  --role "$ROLE_ARN" \
  --handler index.handler \
  --zip-file fileb://lambda/enqueueNote/enqueueNote.zip \
  --environment "Variables={SQS_QUEUE_URL=$QUEUE_URL}"

aws lambda create-function \
  --function-name processNote \
  --runtime nodejs20.x \
  --role "$ROLE_ARN" \
  --handler index.handler \
  --zip-file fileb://lambda/processNote/processNote.zip \
  --environment "Variables={DYNAMODB_TABLE=NotesTable}"

aws lambda create-function \
  --function-name fetchNotes \
  --runtime nodejs20.x \
  --role "$ROLE_ARN" \
  --handler index.handler \
  --zip-file fileb://lambda/fetchNotes/fetchNotes.zip \
  --environment "Variables={DYNAMODB_TABLE=NotesTable}"
```

---

## Step 5 — Wire SQS to processNote Lambda

1. Open the **processNote** Lambda function in the Console.
2. Click **Add trigger**.
3. Select **SQS**.
4. Choose `NotesQueue`.
5. Batch size: `10` (default is fine).
6. Click **Add**.

**CLI:**
```bash
QUEUE_ARN="arn:aws:sqs:us-east-1:123456789012:NotesQueue"

aws lambda create-event-source-mapping \
  --function-name processNote \
  --event-source-arn "$QUEUE_ARN" \
  --batch-size 10
```

---

## Step 6 — Create the API Gateway

1. Open **API Gateway → Create API → REST API → Build**.
2. **API name:** `NotesAPI`. Click **Create API**.

### Create the `/notes` resource

3. Click **Create Resource**.
   - **Resource Path:** `/`
   - **Resource Name:** `notes`
4. Click **Create Resource**.

### Add POST method

5. Select `/notes`, click **Create Method**.
6. Method type: **POST**.
7. Integration type: **Lambda Function**.
8. Lambda function: `enqueueNote`.
9. Click **Create method**.

### Add GET method

10. Select `/notes`, click **Create Method**.
11. Method type: **GET**.
12. Integration type: **Lambda Function**.
13. Lambda function: `fetchNotes`.
14. Click **Create method**.

### Enable CORS

15. Select the `/notes` resource.
16. Click **Enable CORS**.
17. Check **POST**, **GET**, and **OPTIONS**.
18. Access-Control-Allow-Origin: `*`.
19. Click **Save**.

### Deploy the API

20. Click **Deploy API**.
21. Stage name: `prod`.
22. Click **Deploy**.
23. **Copy the Invoke URL** — it looks like: `https://abc123.execute-api.us-east-1.amazonaws.com/prod`

**CLI:**
```bash
# Create the API
API_ID=$(aws apigateway create-rest-api --name NotesAPI --query 'id' --output text)

# Get the root resource id
ROOT_ID=$(aws apigateway get-resources --rest-api-id "$API_ID" --query 'items[0].id' --output text)

# Create /notes resource
RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id "$API_ID" \
  --parent-id "$ROOT_ID" \
  --path-part notes \
  --query 'id' --output text)

# POST method → enqueueNote
aws apigateway put-method --rest-api-id "$API_ID" \
  --resource-id "$RESOURCE_ID" --http-method POST \
  --authorization-type NONE

aws apigateway put-integration --rest-api-id "$API_ID" \
  --resource-id "$RESOURCE_ID" --http-method POST \
  --type AWS_PROXY --integration-http-method POST \
  --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789012:function:enqueueNote/invocations"

# GET method → fetchNotes
aws apigateway put-method --rest-api-id "$API_ID" \
  --resource-id "$RESOURCE_ID" --http-method GET \
  --authorization-type NONE

aws apigateway put-integration --rest-api-id "$API_ID" \
  --resource-id "$RESOURCE_ID" --http-method GET \
  --type AWS_PROXY --integration-http-method POST \
  --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789012:function:fetchNotes/invocations"

# Grant API Gateway permission to invoke Lambdas
aws lambda add-permission --function-name enqueueNote \
  --statement-id apigateway-post \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com

aws lambda add-permission --function-name fetchNotes \
  --statement-id apigateway-get \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com

# Deploy
aws apigateway create-deployment --rest-api-id "$API_ID" --stage-name prod
```

---

## Step 7 — Update the Frontend with the API URL

Open `frontend/app.js` and replace the placeholder:

```js
const API_BASE_URL = "https://abc123.execute-api.us-east-1.amazonaws.com/prod";
```

Use the Invoke URL from Step 6 (**without** a trailing slash).

---

## Step 8 — Deploy the Frontend to S3

1. Open **S3 → Create bucket**.
   - **Bucket name:** `notes-app-frontend-<your-unique-suffix>` (must be globally unique).
   - **Region:** same as your other resources.
   - **Uncheck** "Block all public access" and acknowledge the warning.
2. Click **Create bucket**.

### Enable static website hosting

3. Go to the bucket → **Properties** → **Static website hosting** → **Edit**.
4. Enable, set **Index document** to `index.html`.
5. Save. **Copy the website endpoint URL** (e.g. `http://notes-app-frontend-xyz.s3-website-us-east-1.amazonaws.com`).

### Add a bucket policy for public read

6. Go to **Permissions** → **Bucket policy** → **Edit**.
7. Paste (replace `YOUR_BUCKET_NAME`):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
  }]
}
```

### Upload frontend files

8. Go to **Objects** → **Upload**.
9. Upload `index.html` and `app.js`.

**CLI:**
```bash
BUCKET_NAME="notes-app-frontend-$(date +%s)"

aws s3 mb "s3://$BUCKET_NAME"

aws s3 website "s3://$BUCKET_NAME" --index-document index.html

aws s3api put-public-access-block --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

aws s3api put-bucket-policy --bucket "$BUCKET_NAME" --policy '{
  "Version":"2012-10-17",
  "Statement":[{
    "Sid":"PublicReadGetObject",
    "Effect":"Allow",
    "Principal":"*",
    "Action":"s3:GetObject",
    "Resource":"arn:aws:s3:::'"$BUCKET_NAME"'/*"
  }]
}'

aws s3 cp frontend/index.html "s3://$BUCKET_NAME/"
aws s3 cp frontend/app.js "s3://$BUCKET_NAME/"
```

---

## Step 9 — Test It!

1. Open the **S3 website endpoint URL** in your browser.
2. Type a note and click **Add**.
3. Wait 1-2 seconds (SQS → Lambda → DynamoDB).
4. The note should appear in the list.

### Troubleshooting

| Symptom | Check |
|---|---|
| CORS errors in browser console | Ensure CORS is enabled on API Gateway and the Lambda functions return `Access-Control-Allow-Origin: *` headers |
| 403 on S3 site | Bucket policy allows public read; static hosting is enabled |
| Notes don't appear after adding | Check CloudWatch Logs for `processNote` Lambda; verify SQS trigger is configured |
| 500 errors from API | Check CloudWatch Logs for `enqueueNote` / `fetchNotes`; verify env vars are set |

---

## Cleanup

To avoid charges, delete these resources when done:

```bash
aws s3 rm "s3://$BUCKET_NAME" --recursive
aws s3 rb "s3://$BUCKET_NAME"
aws lambda delete-function --function-name enqueueNote
aws lambda delete-function --function-name processNote
aws lambda delete-function --function-name fetchNotes
aws sqs delete-queue --queue-url "$QUEUE_URL"
aws dynamodb delete-table --table-name NotesTable
aws apigateway delete-rest-api --rest-api-id "$API_ID"
aws iam detach-role-policy --role-name NotesAppLambdaRole --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam detach-role-policy --role-name NotesAppLambdaRole --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess
aws iam detach-role-policy --role-name NotesAppLambdaRole --policy-arn arn:aws:iam::aws:policy/AmazonSQSFullAccess
aws iam delete-role --role-name NotesAppLambdaRole
```
