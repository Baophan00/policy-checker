# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import json
from genlayer import *


class PolicyChecker(gl.Contract):
    """Intelligent Contract that checks if a policy/document supports a given
    answer. Users submit a policy URL + question + expected answer. Validators
    read the policy and determine if it supports, contradicts, or is silent."""

    checks: TreeMap[str, str]

    def __init__(self) -> None:
        pass

    @gl.public.write
    def check_policy(self, question: str, policy_url: str, expected_answer: str) -> str:
        if not question:
            raise gl.vm.UserError("question is required")
        if not policy_url:
            raise gl.vm.UserError("policy_url is required")
        if expected_answer not in ("yes", "no"):
            raise gl.vm.UserError("expected_answer must be 'yes' or 'no'")

        def ask() -> str:
            try:
                page = gl.nondet.web.render(policy_url, mode="text")[:8000]
            except Exception:
                page = "(could not read the policy)"

            prompt = f"""You are a policy compliance checker. Read the following
policy document and determine if it supports or contradicts the expected answer
to the question.

QUESTION: {question}
EXPECTED ANSWER: {expected_answer}

POLICY DOCUMENT:
```
{page}
```

Determine:
1. Does the policy support the expected answer?
2. Does the policy contradict the expected answer?
3. Is the policy silent on this question?

Return ONLY valid JSON:
{{
  "question": "{question}",
  "policy_url": "{policy_url}",
  "expected_answer": "{expected_answer}",
  "verdict": "<SUPPORTED|CONTRADICTED|SILENT>",
  "confidence": <integer 0-100>,
  "relevant_section": "<quote from policy that is most relevant>",
  "reasoning": "<2-3 sentence explanation>",
  "compliance_status": "<COMPLIANT|NON_COMPLIANT|UNCLEAR>"
}}"""

            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(raw, dict):
                raise gl.vm.UserError("model did not return a check")
            verdict = str(raw.get("verdict", "SILENT")).upper().strip()
            if verdict not in ("SUPPORTED", "CONTRADICTED", "SILENT"):
                verdict = "SILENT"
            return json.dumps({
                "question": str(raw.get("question", question)),
                "policy_url": str(raw.get("policy_url", policy_url)),
                "expected_answer": str(raw.get("expected_answer", expected_answer)),
                "verdict": verdict,
                "confidence": int(raw.get("confidence", 0)),
                "relevant_section": str(raw.get("relevant_section", "")).strip()[:300],
                "reasoning": str(raw.get("reasoning", "")).strip()[:400],
                "compliance_status": str(raw.get("compliance_status", "UNCLEAR")).upper().strip(),
            }, sort_keys=True)

        principle = (
            "Both answers check the same policy against the same question. They "
            "agree when they choose the same verdict (SUPPORTED, CONTRADICTED or "
            "SILENT). The relevant section and reasoning may differ in wording. "
            "A different verdict on the same policy is a disagreement."
        )
        agreed = gl.eq_principle.prompt_comparative(ask, principle=principle)
        result = json.loads(agreed)
        if str(result.get("verdict", "")) not in ("SUPPORTED", "CONTRADICTED", "SILENT"):
            raise gl.vm.UserError("no usable check was reached")

        key = question[:60].lower().replace(" ", "_")
        self.checks[key] = json.dumps(result, sort_keys=True)
        return json.dumps(result, sort_keys=True)

    @gl.public.view
    def get_check(self, question: str) -> str:
        key = question[:60].lower().replace(" ", "_")
        return self.checks.get(key, "{}")

    @gl.public.view
    def list_checks(self) -> list[str]:
        return list(self.checks.keys())

    @gl.public.view
    def contract_info(self) -> dict:
        return {
            "name": "PolicyChecker",
            "version": "1.0.0",
            "description": "Decentralized policy compliance checking using GenLayer consensus",
            "author": "modaz",
        }
