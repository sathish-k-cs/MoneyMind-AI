import json
import os
import sqlite3
from collections import defaultdict

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

load_dotenv()

app = FastAPI(title="MoneyMind AI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
DB = os.path.join(os.path.dirname(__file__), "moneymind.db")
client = OpenAI(api_key=os.getenv("GROQ_API_KEY"), base_url="https://api.groq.com/openai/v1")


def init_db():
    with sqlite3.connect(DB) as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS category_rules (
            keyword TEXT PRIMARY KEY, category TEXT NOT NULL
        )""")


def get_rules():
    with sqlite3.connect(DB) as conn:
        rows = conn.execute("SELECT keyword, category FROM category_rules").fetchall()
    return [{"keyword": k, "category": c} for k, c in rows]


init_db()


def amount_of(t):
    try:
        return float(t.get("amount", 0) or 0)
    except (TypeError, ValueError):
        return 0.0


def spending_summary(transactions):
    income = sum(amount_of(t) for t in transactions if amount_of(t) > 0)
    expenses = sum(abs(amount_of(t)) for t in transactions if amount_of(t) < 0)
    category_spending = defaultdict(float)
    for t in transactions:
        amount = amount_of(t)
        if amount < 0:
            category = t.get("category") or "Other"
            category_spending[category] += abs(amount)
    net = income - expenses
    return {
        "income": round(income, 2),
        "expenses": round(expenses, 2),
        "net_cash_flow": round(net, 2),
        "savings_rate_percent": round(net / income * 100, 1) if income else 0,
        "category_breakdown": {k: round(v, 2) for k, v in category_spending.items()},
    }


def simulate_budget_change(transactions, category, reduction_percent):
    summary = spending_summary(transactions)
    current = summary["category_breakdown"].get(category, 0)
    pct = max(0, min(100, float(reduction_percent)))
    monthly_savings = current * pct / 100
    return {
        "category": category, "current_spending": round(current, 2),
        "reduction_percent": pct, "monthly_savings": round(monthly_savings, 2),
        "projected_expenses": round(summary["expenses"] - monthly_savings, 2),
        "annual_savings": round(monthly_savings * 12, 2),
    }



def simulate_rent_increase(transactions, increase_percent, profile=None):
    summary = spending_summary(transactions)
    profile = profile or {}

    monthly_income = float(profile.get("monthly_income") or 0)
    rent = float(profile.get("rent") or 0)
    utilities = float(profile.get("utilities") or 0)
    other_expenses = float(profile.get("other_expenses") or 0)

    fixed_expenses = rent + utilities + other_expenses

    rent_items = [
        abs(amount_of(t)) for t in transactions
        if amount_of(t) < 0 and (
            (t.get("category") or "").lower() == "housing"
            or "rent" in (t.get("name") or t.get("description") or "").lower()
        )
    ]

    current_rent = max(rent_items, default=rent)
    pct = max(0, min(1000, float(increase_percent)))
    increase = current_rent * pct / 100

    base_income = monthly_income or summary["income"]
    base_expenses = summary["expenses"]

    if not rent_items and fixed_expenses > 0:
        base_expenses = fixed_expenses

    new_expenses = base_expenses + increase
    new_net = base_income - new_expenses

    return {
        "current_rent": round(current_rent, 2),
        "increase_percent": pct,
        "rent_increase": round(increase, 2),
        "new_rent": round(current_rent + increase, 2),
        "current_monthly_expenses": round(base_expenses, 2),
        "new_monthly_expenses": round(new_expenses, 2),
        "current_monthly_surplus": round(base_income - base_expenses, 2),
        "new_monthly_surplus": round(new_net, 2),
        "monthly_impact": round(increase, 2),
        "annual_extra_cost": round(increase * 12, 2),
        "new_savings_rate_percent": round(
            new_net / base_income * 100, 1
        ) if base_income else 0,
        "note": "Estimate based on your financial profile or supplied transactions."
    }




def detect_recurring_payments(transactions):
    grouped = defaultdict(list)

    for t in transactions:
        name = (t.get("name") or t.get("description") or "").strip()
        amount = amount_of(t)

        if name and amount < 0:
            grouped[name.lower()].append({
                "name": name,
                "amount": abs(amount),
                "date": t.get("date")
            })

    results = []
    from datetime import datetime

    for _, items in grouped.items():
        if len(items) < 2:
            continue

        items.sort(key=lambda x: str(x["date"] or ""))
        amounts = [x["amount"] for x in items]

        dates = []
        for item in items:
            try:
                dates.append(
                    datetime.strptime(str(item["date"])[:10], "%Y-%m-%d")
                )
            except (ValueError, TypeError):
                pass

        frequency = "Irregular"
        monthly = None

        if len(dates) >= 2:
            gaps = [
                (dates[i] - dates[i - 1]).days
                for i in range(1, len(dates))
            ]
            avg = sum(gaps) / len(gaps)

            if 5 <= avg <= 9:
                frequency = "Weekly"
                monthly = sum(amounts) / len(amounts) * 4.33
            elif 25 <= avg <= 35:
                frequency = "Monthly"
                monthly = sum(amounts) / len(amounts)
            elif 80 <= avg <= 100:
                frequency = "Quarterly"
                monthly = sum(amounts) / len(amounts) / 3
            elif 350 <= avg <= 380:
                frequency = "Yearly"
                monthly = sum(amounts) / len(amounts) / 12

        price_changed = (
            frequency != "Irregular"
            and len(amounts) >= 3
            and max(amounts) - min(amounts)
            > (sum(amounts) / len(amounts)) * 0.05
        )

        results.append({
            "merchant": items[-1]["name"],
            "occurrences": len(items),
            "frequency": frequency,
            "average_amount": round(sum(amounts) / len(amounts), 2),
            "monthly_estimate": round(monthly, 2) if monthly is not None else None,
            "price_changed": price_changed
        })

    return results



TOOLS = [
    {"type": "function", "function": {"name": "get_spending_summary", "description": "Calculate actual income, expenses, net cash flow, savings rate and category spending.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "simulate_budget_change", "description": "Calculate savings from reducing a spending category.", "parameters": {"type": "object", "properties": {"category": {"type": "string"}, "reduction_percent": {"type": "number"}}, "required": ["category", "reduction_percent"]}}},
    {"type": "function", "function": {"name": "simulate_rent_increase", "description": "Calculate the impact of a rent increase using provided transactions. Use 10 percent if the user does not specify.", "parameters": {"type": "object", "properties": {"increase_percent": {"type": "number"}}, "required": ["increase_percent"]}}},
    {"type": "function", "function": {"name": "detect_recurring_payments", "description": "Identify repeated merchants and estimate recurring payments from transactions.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "save_category_rule", "description": "Save a category correction the user explicitly requests.", "parameters": {"type": "object", "properties": {"keyword": {"type": "string"}, "category": {"type": "string"}}, "required": ["keyword", "category"]}}},
]


def run_tool(name, args, transactions, profile=None):
    if name == "get_spending_summary":
        return spending_summary(transactions)
    if name == "simulate_budget_change":
        return simulate_budget_change(transactions, args["category"], args["reduction_percent"])
    if name == "simulate_rent_increase":
        return simulate_rent_increase(
            transactions,
            args.get("increase_percent", 10),
            profile
        )
    if name == "detect_recurring_payments":
        return detect_recurring_payments(transactions)
    if name == "save_category_rule":
        keyword = args["keyword"].strip().lower()
        category = args["category"].strip()
        allowed = [
            "Food & dining", "Transport", "Shopping",
            "Bills", "Housing", "Health", "Other"
        ]

        if category not in allowed:
            return {"error": "Invalid category"}
        if not keyword or not category:
            return {"error": "Keyword and category are required"}
        with sqlite3.connect(DB) as conn:
            conn.execute("INSERT OR REPLACE INTO category_rules(keyword, category) VALUES (?, ?)", (keyword, category))
        return {"saved": True, "keyword": keyword, "category": category}
    return {"error": "Unknown tool"}


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    transactions: list[dict] = Field(default_factory=list)
    profile: dict = Field(default_factory=dict)

class CategoryRuleRequest(BaseModel):
    keyword: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=50)


@app.post("/api/memory")
def save_category_rule(req: CategoryRuleRequest):
    allowed = [
        "Food & dining", "Transport", "Shopping",
        "Bills", "Housing", "Health", "Other"
    ]

    keyword = req.keyword.strip().lower()
    category = req.category.strip()

    if category not in allowed:
        raise HTTPException(status_code=400, detail="Invalid category")

    with sqlite3.connect(DB) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO category_rules(keyword, category) VALUES (?, ?)",
            (keyword, category)
        )

    return {"saved": True, "keyword": keyword, "category": category}

@app.get("/")
def root():
    return {"status": "MoneyMind Groq backend is running", "model": MODEL}

class RecurringRequest(BaseModel):
    transactions: list[dict] = Field(default_factory=list)


@app.post("/api/recurring")
def recurring(req: RecurringRequest):
    return {
        "recurring": detect_recurring_payments(req.transactions)
    }

@app.get("/api/memory")
def memory():
    return {"rules": get_rules()}


@app.post("/api/chat")
def chat(req: ChatRequest):
    if not os.getenv("GROQ_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is missing from the backend .env file."
        )

    transactions = req.transactions[:5000]
    summary = spending_summary(transactions)
    profile = req.profile or {}
    user_message = req.message.lower()

    monthly_income = float(profile.get("monthly_income") or 0)
    rent = float(profile.get("rent") or 0)
    utilities = float(profile.get("utilities") or 0)
    other_expenses = float(profile.get("other_expenses") or 0)
    emergency_fund = float(profile.get("emergency_fund") or 0)
    savings_target = float(profile.get("savings_target") or 0)

    fixed_expenses = rent + utilities + other_expenses
    remaining_after_fixed = monthly_income - fixed_expenses

    # Handle rent simulations directly in Python.
    if "rent" in user_message and any(
        word in user_message
        for word in ["increase", "increases", "higher", "rise", "goes up"]
    ):
        rent_items = [
            abs(amount_of(t))
            for t in transactions
            if amount_of(t) < 0 and (
                (t.get("category") or "").lower() == "housing"
                or "rent" in (
                    t.get("name") or t.get("description") or ""
                ).lower()
            )
        ]

        current_rent = max(rent_items, default=rent)

        if current_rent <= 0:
            return {
                "reply": "I couldn't identify a rent transaction. Please check that your rent is recorded as a Housing expense.",
                "financial_summary": summary,
                "memory": get_rules()
            }

        percentages = [10, 20, 30]
        lines = [
            "Your rent increase simulation:",
            f"Current monthly rent: ₹{current_rent:,.2f}",
            ""
        ]

        for pct in percentages:
            increase = current_rent * pct / 100
            new_rent = current_rent + increase
            base_income = monthly_income or summary["income"]

            base_expenses = summary["expenses"]

            if not rent_items and fixed_expenses > 0:
                base_expenses = fixed_expenses

            new_expenses = base_expenses + increase
            new_savings = base_income - new_expenses

            lines.append(
                f"{pct}% increase: New rent ₹{new_rent:,.2f}; "
                f"extra monthly cost ₹{increase:,.2f}; "
                f"new monthly savings ₹{new_savings:,.2f}."
            )

        lines.extend([
            "",
            "These estimates assume all other income and expenses remain unchanged. "
            "The largest rent/Housing transaction in your supplied data is used "
            "as the monthly rent estimate."
        ])

        return {
            "reply": "\n".join(lines),
            "financial_summary": summary,
            "memory": get_rules()
        }

    system_prompt = f"""You are MoneyMind, a concise and friendly personal budgeting coach for Indian users.

Use Indian Rupees (₹).
The user's supplied transactions and financial summary are the source of truth.
Never invent transactions, income, expenses, rent, goals or categories.
Use the supplied summary to answer spending and savings questions.
Explain calculations clearly and distinguish monthly figures from annual projections.
Only save category rules when the user explicitly asks to remember a correction.
This is educational budgeting support, not professional financial advice.

CURRENT SUMMARY:
{json.dumps(summary, ensure_ascii=False)}

FINANCIAL PROFILE:
{json.dumps({
    "monthly_income": monthly_income,
    "monthly_rent": rent,
    "utilities_and_bills": utilities,
    "other_fixed_expenses": other_expenses,
    "total_fixed_monthly_expenses": fixed_expenses,
    "emergency_fund": emergency_fund,
    "savings_target": savings_target,
    "remaining_after_fixed_expenses": remaining_after_fixed
}, ensure_ascii=False)}

PROFILE INSTRUCTIONS:
- Use the financial profile when answering personal budgeting questions.
- Use monthly income and fixed expenses to estimate the remaining monthly amount.
- Use the emergency fund and savings target when discussing savings progress.
- Clearly distinguish profile figures from actual transaction totals.
- If profile values are zero or missing, do not assume they are accurate or invent replacements.
- Do not count the same expense twice.

CATEGORY RULES:
{json.dumps(get_rules(), ensure_ascii=False)}
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": req.message}
    ]

    
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.3
        )

        while response.choices[0].message.tool_calls:
            assistant_message = response.choices[0].message
            messages.append(assistant_message.model_dump(exclude_none=True))

            for tool_call in assistant_message.tool_calls:
                tool_name = tool_call.function.name
                tool_args = json.loads(tool_call.function.arguments or "{}")

                result = run_tool(
                    tool_name,
                    tool_args,
                    transactions,
                    profile
                )

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, ensure_ascii=False)
                })

            response = client.chat.completions.create(
                model=MODEL,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.3
            )

        final_text = (
            response.choices[0].message.content
            or "I couldn't generate a response. Please try again."
        )

        return {
            "reply": final_text,
            "financial_summary": summary,
            "memory": get_rules()
        }

    except Exception as exc:
        print("AI ERROR:", repr(exc))
        raise HTTPException(
            status_code=502,
            detail="The AI service failed. Check the backend terminal and your Groq model/API key."
        )
