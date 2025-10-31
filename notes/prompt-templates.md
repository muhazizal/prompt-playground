# Prompt Templates — Phase 1

A compact set of prompt engineering templates using few-shot patterns and stepwise reasoning (chain-of-thought inspired) while keeping outputs concise and structured.

## 1) Few-Shot Classification (JSON)

Goal: Map text to one of labeled categories with short rationale.

System

```
You are a precise labeling assistant. Apply definitions strictly.
Return a compact JSON object with keys: label, confidence (0–1), rationale.
```

Definitions

```
Labels:
- Positive: expresses satisfaction, praise, or good outcome.
- Negative: expresses dissatisfaction, complaint, or bad outcome.
- Neutral: factual or mixed sentiment without strong polarity.
```

Examples

```
Input: "Loved the new update—battery lasts all day!"
Output: {"label":"Positive","confidence":0.92,"rationale":"Praise and satisfaction."}

Input: "App crashes every time I open settings."
Output: {"label":"Negative","confidence":0.95,"rationale":"Complaint about failure."}

Input: "The package arrived on Monday."
Output: {"label":"Neutral","confidence":0.88,"rationale":"Factual statement only."}
```

Template

```
Task: Classify the following text using the label set above.
Text: "{{input_text}}"
Return JSON only.
```

## 2) Few-Shot Transformation (Style/Format)

Goal: Rewrite text to target style and format, keeping meaning intact.

System

```
You are a controlled rewriting assistant. Preserve meaning, remove redundancy, obey format.
Return only the transformed text.
```

Examples

```
Input: "The meeting was kind of okay, we talked about several things."
Output (Bullet list):
- Outcome: Meeting was satisfactory
- Topics: Budget review, timeline, risks
- Next step: Share minutes

Input: "pls send report asap. thx"
Output (Formal):
"Please send the report as soon as possible. Thank you."
```

Template

```
Target format: Bullet list | Formal | Headline | JSON schema
Constraints: Keep key facts, avoid filler, no added claims.
Text: "{{input_text}}"
```

## 3) Structured Extraction (Schema)

Goal: Extract fields into a strict schema for downstream use.

System

```
You are an information extraction assistant. Return JSON exactly matching the schema.
Unknown values must be null.
```

Schema

```
{
  "company": string | null,
  "product": string | null,
  "price": number | null,
  "currency": string | null,
  "features": string[]
}
```

Examples

```
Input: "Acme launches the Bolt smartwatch at $199 featuring GPS and NFC."
Output:
{"company":"Acme","product":"Bolt","price":199,"currency":"USD","features":["GPS","NFC"]}
```

Template

```
Extract into the schema above.
Text: "{{input_text}}"
Return JSON only.
```

## 4) Stepwise Reasoning (Concise)

Goal: Encourage better reasoning without verbose inner monologue.

System

```
You are a structured reasoning assistant.
Work through the problem internally, then output:
- answer: final result
- steps: 3–5 concise bullet points (no inner monologue)
```

Examples

```
Question: "If a train travels 60 km/h for 2.5 hours, how far?"
Output:
answer: 150 km
steps:
- speed × time → distance
- 60 × 2.5 = 150
- units are kilometers
```

Template

```
Question: {{question}}
Output format:
answer: <short answer>
steps:
- <concise step 1>
- <concise step 2>
- <concise step 3>
```

## Tips

- Be token-efficient: define labels once, keep examples short.
- Use JSON schemas to control outputs and simplify parsing.
- Keep “steps” concise to avoid verbose reasoning; prefer bullet points.
- Set `temperature ~0.2–0.4` for stable classification/extraction; higher for creative rewriting.
