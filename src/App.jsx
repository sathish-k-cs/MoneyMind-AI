import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  LayoutDashboard, Wallet, Target, User, ArrowUpRight, ArrowDownRight,
  Sparkles, Search, Plus, ChevronRight, Coffee, ShoppingBag, Car,
  Home, Zap, TrendingUp, Send, CalendarDays,
  Pencil, Trash2, X, Upload, ArrowLeft, CheckCircle2
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, Tooltip, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid
} from "recharts";
import "./App.css";
import jsPDF from "jspdf";

const STORAGE_TRANSACTIONS = "moneymind_transactions";
const STORAGE_GOALS = "moneymind_goals";
const STORAGE_PROFILE = "moneymind_profile";

const defaultProfile = {
  monthlyIncome: "",
  rent: "",
  utilities: "",
  otherExpenses: "",
  emergencyFund: "",
  savingsTarget: "",
};
const COLORS = {
  "Food & dining": "#8b5cf6", Transport: "#38bdf8", Shopping: "#f59e0b",
  Bills: "#10b981", Housing: "#22c55e", Health: "#fb7185", Income: "#10b981",
  Other: "#f472b6"
};

const sampleTransactions = [
  { id: "sample-1", name: "Swiggy", category: "Food & dining", date: "2026-11-02", amount: -450 },
  { id: "sample-2", name: "Uber", category: "Transport", date: "2026-11-03", amount: -280 },
  { id: "sample-3", name: "Amazon", category: "Shopping", date: "2026-11-04", amount: -1200 },
  { id: "sample-4", name: "Electricity Bill", category: "Bills", date: "2026-11-05", amount: -1800 },
  { id: "sample-5", name: "Salary", category: "Income", date: "2026-11-01", amount: 65000 },
  { id: "sample-6", name: "Zomato", category: "Food & dining", date: "2026-11-06", amount: -550 },
  { id: "sample-7", name: "Metro", category: "Transport", date: "2026-11-07", amount: -100 },
  { id: "sample-8", name: "Netflix", category: "Other", date: "2026-11-08", amount: -649 },
  { id: "sample-9", name: "Flipkart", category: "Shopping", date: "2026-11-09", amount: -2200 },
  { id: "sample-10", name: "Petrol", category: "Transport", date: "2026-11-10", amount: -1500 },
  { id: "sample-11", name: "Coffee Cafe", category: "Food & dining", date: "2026-11-11", amount: -320 },
  { id: "sample-12", name: "Internet Bill", category: "Bills", date: "2026-11-12", amount: -999 }
];

const defaultGoals = [
  { id: "goal-laptop", name: "New laptop", target: 80000, saved: 28000, dueDate: "2027-03-01", icon: "💻" }
];

const money = (value) => `₹${Math.abs(Number(value) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const readStorage = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

function categorize(description = "", rules = []) {
  const value = description.toLowerCase();
  for (const rule of rules) {
    if (rule.keyword && value.includes(rule.keyword.toLowerCase())) return rule.category;
  }
  if (/salary|payroll|income/.test(value)) return "Income";
  if (/rent|house rent|maintenance/.test(value)) return "Housing";
  if (/electricity|water|internet|bill|recharge/.test(value)) return "Bills";
  if (/swiggy|zomato|restaurant|food|cafe|coffee|starbucks/.test(value)) return "Food & dining";
  if (/uber|ola|metro|petrol|fuel|bus|train|rapido/.test(value)) return "Transport";
  if (/amazon|flipkart|shopping|myntra/.test(value)) return "Shopping";
  if (/hospital|pharmacy|medicine|doctor/.test(value)) return "Health";
  return "Other";
}

function App() {
  const [page, setPage] = useState("Overview");
  const [transactions, setTransactions] = useState(() => {
    const saved = readStorage(STORAGE_TRANSACTIONS, sampleTransactions);
    // Repair previously imported positive-amount expenses from CSV files that had no debit/credit column.
    return saved.map((t) => {
      const name = String(t.name || "");
      const category = categorize(name);
      const looksLikeExpense = /swiggy|zomato|uber|ola|amazon|flipkart|electricity|internet bill|netflix|petrol|coffee cafe|metro|rent/i.test(name);
      if (t.category === "Income" && looksLikeExpense && category !== "Income") {
        return { ...t, category, amount: -Math.abs(Number(t.amount) || 0) };
      }
      return t;
    });
  });
  const [goals, setGoals] = useState(() => readStorage(STORAGE_GOALS, defaultGoals));
  const [categoryRules, setCategoryRules] = useState([]);
  const [importMessage, setImportMessage] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chat, setChat] = useState([
    { role: "ai", text: "Hey! I'm your MoneyMind coach. Ask me about your spending, savings or a budget scenario." }
  ]);
  const [transactionModal, setTransactionModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [goalModal, setGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [txForm, setTxForm] = useState({ name: "", amount: "", category: "Food & dining", date: todayISO(), type: "expense" });
  const [goalForm, setGoalForm] = useState({ name: "", target: "", saved: "0", dueDate: "", icon: "🎯" });
  const [profileOpen, setProfileOpen] = useState(false);
  const [recurringPayments, setRecurringPayments] = useState([]);
  const [reportMonth, setReportMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [profile, setProfile] = useState(() => {
    try {
      return {
        ...defaultProfile,
        ...JSON.parse(
          localStorage.getItem(STORAGE_PROFILE) || "{}"
        ),
      };
    } catch {
      return defaultProfile;
    }
  });
  useEffect(() => {
    const closeProfile = (event) => {
      if (!event.target.closest(".avatar-menu-wrap")) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("click", closeProfile);

    return () => {
      document.removeEventListener("click", closeProfile);
    };
  }, []);
  useEffect(() => {
    localStorage.setItem(
      STORAGE_PROFILE,
      JSON.stringify(profile)
    );
  }, [profile]);
  useEffect(() => localStorage.setItem(STORAGE_TRANSACTIONS, JSON.stringify(transactions)), [transactions]);
  useEffect(() => localStorage.setItem(STORAGE_GOALS, JSON.stringify(goals)), [goals]);
  useEffect(() => {
    fetch("http://localhost:8000/api/memory")
      .then((r) => { if (!r.ok) throw new Error("Memory endpoint unavailable"); return r.json(); })
      .then((data) => setCategoryRules(data.rules || []))
      .catch((err) => console.warn("MoneyMind memory:", err));
  }, []);

  const dashboardTransactions = useMemo(
    () =>
      transactions.filter(
        (t) => (t.date || "").slice(0, 7) === reportMonth
      ),
    [transactions, reportMonth]
  );

  const income = dashboardTransactions
    .filter(t => Number(t.amount) > 0)
    .reduce((s, t) => s + Number(t.amount), 0);
  const expenses = dashboardTransactions
    .filter(t => Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const savings = income - expenses;
  const savingsRate = income > 0 ? savings / income * 100 : 0;
  const foodSpend = dashboardTransactions
    .filter(t => t.category === "Food & dining" && Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const potentialFoodSavings = foodSpend * 0.2;
  const allIncome = transactions
    .filter(t => Number(t.amount) > 0)
    .reduce((s, t) => s + Number(t.amount), 0);

  const allExpenses = transactions
    .filter(t => Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const allSavings = allIncome - allExpenses;

const downloadMonthlyReport = () => {
  const pdfMoney = (amount) =>
  `INR ${Number(amount).toLocaleString("en-IN")}`;
  const doc = new jsPDF();

  doc.setFontSize(22);
  doc.text("MoneyMind AI", 20, 20);

  doc.setFontSize(16);
  doc.text("Monthly Financial Health Report", 20, 35);

  doc.setFontSize(11);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, 20, 45);

  doc.text(`Report Month: ${reportMonth}`, 20, 55);

  doc.setFontSize(13);
  doc.text("Financial Summary", 20, 65);

  doc.setFontSize(11);
  doc.text(`Total Income: ${pdfMoney(monthlyReport.income)}`, 20, 80);
  doc.text(`Total Expenses: ${pdfMoney(monthlyReport.expenses)}`, 20, 90);
  doc.text(`Net Savings: ${pdfMoney(monthlyReport.savings)}`, 20, 100);
  doc.text(`Savings Rate: ${monthlyReport.savingsRate.toFixed(1)}%`, 20, 110);

  doc.text("Highest Spending Category", 20, 130);
  doc.text(
    `${monthlyReport.topCategory}: ${pdfMoney(monthlyReport.topAmount)}`,
    20,
    140
  );

  doc.setFontSize(10);
  doc.text(
    "MoneyMind AI provides educational budgeting support only.",
    20,
    165
  );

  doc.save("MoneyMind-Monthly-Report.pdf");
};
const monthlyReport = useMemo(() => {
  const monthTransactions = transactions.filter(
    (t) => (t.date || "").slice(0, 7) === reportMonth
  );

  let monthIncome = 0;
  let monthExpenses = 0;
  const categoryTotals = {};

  monthTransactions.forEach((t) => {
    const amount = Number(t.amount) || 0;

    if (amount > 0 || t.type === "income") {
      monthIncome += Math.abs(amount);
    } else {
      monthExpenses += Math.abs(amount);

      const category = t.category || "Other";
      categoryTotals[category] =
        (categoryTotals[category] || 0) + Math.abs(amount);
    }
  });

  const topCategory = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])[0];

  const monthSavings = monthIncome - monthExpenses;

  return {
    income: monthIncome,
    expenses: monthExpenses,
    savings: monthSavings,
    savingsRate: monthIncome > 0
      ? (monthSavings / monthIncome) * 100
      : 0,
    topCategory: topCategory?.[0] || "No spending yet",
    topAmount: topCategory?.[1] || 0,
  };
}, [transactions, reportMonth]);

const spendingDrift = useMemo(() => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const previousDate = new Date(currentYear, currentMonth - 1, 1);
  const previousMonth = previousDate.getMonth();
  const previousYear = previousDate.getFullYear();

  const currentMonthExpenses = transactions.filter((t) => {
    const date = new Date(`${t.date}T00:00:00`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.getMonth() === currentMonth &&
      date.getFullYear() === currentYear &&
      Number(t.amount) < 0
    );
  });

  if (currentMonthExpenses.length === 0) return [];

  const latestDay = Math.max(
    ...currentMonthExpenses.map((t) =>
      new Date(`${t.date}T00:00:00`).getDate()
    )
  );

  const comparisonDay = Math.min(
    latestDay,
    new Date(previousYear, previousMonth + 1, 0).getDate()
  );

  const totals = { current: {}, previous: {} };
  const previousCounts = {};

  transactions.forEach((t) => {
    const date = new Date(`${t.date}T00:00:00`);
    const amount = Number(t.amount);

    if (Number.isNaN(date.getTime()) || amount >= 0) return;

    const category = t.category || "Other";
    const value = Math.abs(amount);
    const day = date.getDate();

    if (
      date.getFullYear() === currentYear &&
      date.getMonth() === currentMonth &&
      day <= comparisonDay
    ) {
      totals.current[category] =
        (totals.current[category] || 0) + value;
    }

    if (
      date.getFullYear() === previousYear &&
      date.getMonth() === previousMonth &&
      day <= comparisonDay
    ) {
      totals.previous[category] =
        (totals.previous[category] || 0) + value;

      previousCounts[category] =
        (previousCounts[category] || 0) + 1;
    }
  });

  // No previous-month data means no reliable comparison.

  const categories = new Set([
    ...Object.keys(totals.current),
    ...Object.keys(totals.previous),
  ]);

  return [...categories]
    .map((category) => {
      const current = totals.current[category] || 0;
      const previous = totals.previous[category] || 0;

      return {
        category,
        current,
        previous,
        change: previous > 0
          ? ((current - previous) / previous) * 100
          : null,
      };
    })
    .filter((item) =>
      item.current > 0 &&
      (previousCounts[item.category] || 0) >= 3 &&
      item.change >= 10
    )
    .sort((a, b) => b.current - a.current);
}, [transactions]);



  const categories = useMemo(() => {
    const totals = {};
    dashboardTransactions.forEach(t => {
      if (Number(t.amount) < 0) totals[t.category || "Other"] = (totals[t.category || "Other"] || 0) + Math.abs(Number(t.amount));
    });
    return Object.entries(totals).map(([name, amount]) => ({ name, amount, color: COLORS[name] || COLORS.Other }));
  }, [dashboardTransactions]);

  const weekly = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => ({ day, expense: 0 }));
    dashboardTransactions.forEach(t => {
      if (Number(t.amount) >= 0 || !t.date) return;
      const d = new Date(`${t.date}T12:00:00`);
      if (Number.isNaN(d.getTime())) return;
      const index = (d.getDay() + 6) % 7;
      days[index].expense += Math.abs(Number(t.amount));
    });
    return days;
  }, [dashboardTransactions]);

  const filteredTransactions = transactions.filter(t =>
    `${t.name} ${t.category} ${t.date}`.toLowerCase().includes(search.toLowerCase())
  );

  const openNewTransaction = () => {
    setEditingTransaction(null);
    setTxForm({
      name: "",
      amount: "",
      category: "Food & dining",
      date: todayISO(),
      type: "expense"
    });
    setTransactionModal(true);
  };
  const openEditTransaction = (t) => {
    setEditingTransaction(t);
    setTxForm({ name: t.name, amount: String(Math.abs(Number(t.amount))), category: t.category, date: t.date || todayISO(), type: Number(t.amount) >= 0 ? "income" : "expense" });
    setTransactionModal(true);
  };
  const saveTransaction = async (e) => {
    const suggestedCategory = categorize(txForm.name, categoryRules);
    e.preventDefault();

    const value = Number(txForm.amount);
    if (!txForm.name.trim() || !Number.isFinite(value) || value <= 0) return;

    const record = {
      id: editingTransaction?.id || `tx-${Date.now()}`,
      name: txForm.name.trim(),
      category: txForm.type === "income"
        ? "Income"
        : (categoryRules.some(r =>
            r.keyword && txForm.name.toLowerCase().includes(r.keyword.toLowerCase())
          )
            ? suggestedCategory
            : txForm.category),
      date: txForm.date || todayISO(),
      amount: txForm.type === "income" ? value : -value
    };

    setTransactions(prev =>
      editingTransaction
        ? prev.map(t => t.id === editingTransaction.id ? record : t)
        : [record, ...prev]
    );

    // Learn the corrected category for future transactions.
    if (
      editingTransaction &&
      Number(editingTransaction.amount) < 0 &&
      record.category !== editingTransaction.category
    ) {
      try {
        const response = await fetch("http://localhost:8000/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: record.name,
            category: record.category
          })
        });

        if (!response.ok) throw new Error("Could not save category rule");

        setCategoryRules(prev => [
          ...prev.filter(r => r.keyword !== record.name.toLowerCase()),
          { keyword: record.name.toLowerCase(), category: record.category }
        ]);

        setImportMessage(
          `Category updated. MoneyMind learned that ${record.name} belongs to ${record.category}.`
        );
      } catch (error) {
        console.error("Category learning error:", error);
        setImportMessage("Transaction updated, but the learning rule could not be saved.");
      }
    }

    setTransactionModal(false);
  };
  const deleteTransaction = (id) => {
    if (window.confirm("Delete this transaction?")) setTransactions(prev => prev.filter(t => t.id !== id));
  };
  const deleteAllTransactions = () => {
    if (transactions.length === 0) {
      alert("There are no transactions to delete.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete all ${transactions.length} transactions? This action cannot be undone.`
    );

    if (confirmed) {
      setTransactions([]);
      setSearch("");
      setImportMessage("All transactions deleted. You can now import your own CSV file.");
    }
  };
  const openNewGoal = () => {
    setEditingGoal(null);
    setGoalForm({ name: "", target: "", saved: "0", dueDate: "", icon: "🎯" });
    setGoalModal(true);
  };
  const openEditGoal = (g) => {
    setEditingGoal(g);
    setGoalForm({ name: g.name, target: String(g.target), saved: String(g.saved), dueDate: g.dueDate || "", icon: g.icon || "🎯" });
    setGoalModal(true);
  };
  const saveGoal = (e) => {
    e.preventDefault();
    const target = Number(goalForm.target);
    const saved = Number(goalForm.saved);
    if (!goalForm.name.trim() || target <= 0 || saved < 0) return;
    const record = { id: editingGoal?.id || `goal-${Date.now()}`, name: goalForm.name.trim(), target, saved, dueDate: goalForm.dueDate, icon: goalForm.icon || "🎯" };
    setGoals(prev => editingGoal ? prev.map(g => g.id === editingGoal.id ? record : g) : [...prev, record]);
    setGoalModal(false);
  };
  const deleteGoal = (id) => {
    if (window.confirm("Delete this goal?")) setGoals(prev => prev.filter(g => g.id !== id));
  };

  const handleCSVUpload = (file) => {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: ({ data, errors }) => {
        const imported = data.map((row, index) => {
          const keys = Object.keys(row);
          const findKey = terms => keys.find(k => terms.some(term => k.toLowerCase().trim().includes(term)));
          const nameKey = findKey(["description", "merchant", "details", "narration", "name", "particular"]);
          const amountKey = findKey(["amount", "transaction amount"]);
          const dateKey = findKey(["date", "transaction date", "time"]);
          const debitKey = findKey(["debit", "withdrawal"]);
          const creditKey = findKey(["credit", "deposit"]);
          const name = nameKey ? String(row[nameKey] || "").trim() : "Imported transaction";
          let amount = amountKey ? Number(String(row[amountKey]).replace(/[^0-9.-]/g, "")) : 0;
          let explicitCredit = false;
          if (debitKey || creditKey) {
            const debit = Number(String(row[debitKey] || "").replace(/[^0-9.-]/g, "")) || 0;
            const credit = Number(String(row[creditKey] || "").replace(/[^0-9.-]/g, "")) || 0;
            if (debit > 0 || credit > 0) {
              amount = credit > 0 ? credit : -debit;
              explicitCredit = credit > 0;
            }
          }
          if (!Number.isFinite(amount) || amount === 0) return null;
          const category = categorize(name, categoryRules);
          // A positive Amount column alone does not mean income: many CSV exports use positive values for debits too.
          const isIncome = explicitCredit || (amount > 0 && (category === "Income" || /salary|payroll|income|refund|cashback|interest credited/i.test(name)));
          const rawDate = dateKey ? String(row[dateKey] || "") : todayISO();
          const parsed = new Date(rawDate);
          const date = !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : todayISO();
          return { id: `csv-${Date.now()}-${index}`, name: name || "Imported transaction", category: isIncome ? "Income" : category, date, amount: isIncome ? Math.abs(amount) : -Math.abs(amount) };
        }).filter(Boolean);
        if (!imported.length) {
          setImportMessage(errors.length ? "CSV could not be read. Check the column headings and amount values." : "No usable transactions found. Include a description and amount, or debit/credit columns.");
          return;
        }
        setTransactions(prev => {
          const incomingKeys = new Set(imported.map(t => `${t.date}|${t.name.toLowerCase()}`));
          const kept = prev.filter(t => !incomingKeys.has(`${t.date}|${String(t.name || "").toLowerCase()}`));
          return [...imported, ...kept];
        });
        setImportMessage(`Imported ${imported.length} transactions successfully. Matching existing rows were updated, not duplicated.`);
        setPage("Transactions");
      },
      error: () => setImportMessage("Couldn't read this CSV file.")
    });
  };

  const sendMessage = async (preset) => {
    const userMessage = (preset || message).trim();
    if (!userMessage || chatLoading) return;
    setChat(prev => [...prev, { role: "user", text: userMessage }]);
    setMessage("");
    setChatLoading(true);
    try {
      const response = await fetch("http://localhost:8000/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          transactions: transactions.map(({ name, category, date, amount }) => ({
            name, category, date, amount
          })),
          profile: {
            monthly_income: Number(profile.monthlyIncome || 0),
            rent: Number(profile.rent || 0),
            utilities: Number(profile.utilities || 0),
            other_expenses: Number(profile.otherExpenses || 0),
            emergency_fund: Number(profile.emergencyFund || 0),
            savings_target: Number(profile.savingsTarget || 0)
          }
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || `Backend error ${response.status}`);
      setChat(prev => [...prev, { role: "ai", text: data.reply || data.response || "I couldn't read the AI response." }]);
    } catch (error) {
      console.error("AI chat error:", error);
      setChat(prev => [...prev, { role: "ai", text: "I couldn't connect to the AI server. Check that the backend is running at http://localhost:8000, then try again." }]);
    } finally {
      setChatLoading(false);
    }
  };
  const detectRecurring = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions })
      });

      if (!response.ok) throw new Error("Detection failed");

      const data = await response.json();
      setRecurringPayments(data.recurring || []);
    } catch (error) {
      console.error("Recurring detection error:", error);
    }
  };
  useEffect(() => {
    detectRecurring();
  }, [transactions]);
  const navItems = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Transactions", icon: Wallet },
    { label: "Goals", icon: Target },
    { label: "Financial Profile", icon: User }
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-icon"><Wallet size={21} /></div><span>money<span className="brand-accent">mind</span></span></div>
        <div className="nav-label">MENU</div>
        <nav>{navItems.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={`nav-item ${page === label ? "active" : ""}`}
            onClick={() => setPage(label)}
          >
            <Icon size={18} /> {label}
          </button>
        ))}</nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card"><Sparkles size={18} color="#a78bfa" /><strong>Your AI companion</strong><p>Small changes today, a richer tomorrow.</p></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="breadcrumb-home"
              onClick={() => setPage("Overview")}
            >
              Workspace
            </button>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="top-actions"><div className="search"><Search size={16} /><input aria-label="Search transactions" placeholder="Search transactions..." value={search} onChange={e => setSearch(e.target.value)} /></div><div className="avatar-menu-wrap">
  <button
    className="avatar small avatar-button"
    onClick={() => setProfileOpen(prev => !prev)}
    aria-label="Open profile menu"
    aria-expanded={profileOpen}
  >
    S
  </button>

  {profileOpen && (
    <div className="profile-menu">
      <strong>Personal account</strong>
      <small>Local account</small>
      <button onClick={() => {
        setPage("Overview");
        setProfileOpen(false);
      }}>
        Go to Overview
      </button>
      <button onClick={() => setProfileOpen(false)}>
        Close menu
      </button>
    </div>
  )}
</div></div>
        </header>

        <div className="page-content">
          {page === "Overview" ? (<>
            <div className="welcome-row"><div><div className="eyebrow">{new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}</div><h1>Your money, in focus. <span>✦</span></h1><p className="subtitle">Here's your financial snapshot from the transactions you have added.</p>
              <div className="header-buttons">
                <label className="upload-button"><Upload size={16} /> Import CSV<input type="file" accept=".csv,text/csv" onChange={e => { const file = e.target.files?.[0]; if (file) handleCSVUpload(file); e.target.value = ""; }} /></label>
                <button className="primary-button" onClick={openNewTransaction}><Plus size={17} /> Add transaction</button>
              </div>
            </div>
            </div>
            {importMessage && <div className="import-message"><CheckCircle2 size={16} />{importMessage}<button onClick={() => setImportMessage("")} aria-label="Dismiss"><X size={15}/></button></div>}
            <section className="stats-grid">
              <div className="stat-card balance-card"><div className="stat-top"><span>Net balance</span><Wallet size={17}/></div><h2>{savings < 0 ? "-" : ""}{money(savings)}</h2><div className="stat-foot">{savingsRate.toFixed(1)}% <span>of income retained</span></div><div className="balance-decoration"/></div>
              <div className="stat-card"><div className="stat-top"><span>Income</span><div className="stat-icon green"><ArrowDownRight size={17}/></div></div><h2>{money(income)}</h2><div className="stat-foot"></div>{dashboardTransactions.filter(t => Number(t.amount) > 0).length} income transactions</div>
              <div className="stat-card"><div className="stat-top"><span>Expenses</span><div className="stat-icon red"><ArrowUpRight size={17}/></div></div><h2>{money(expenses)}</h2><div className="stat-foot">{income > 0 ? (expenses / income * 100).toFixed(1) : "0.0"}% of income</div></div>
              <div className="stat-card"><div className="stat-top"><span>Net savings</span><div className="stat-icon purple"><Target size={17}/></div></div><h2>{savings < 0 ? "-" : ""}{money(savings)}</h2><div className="stat-foot positive"><TrendingUp size={15}/> {savingsRate.toFixed(1)}% <span>savings rate</span></div></div>
            </section>
            <section className="middle-grid">
              <div className="panel spending-panel"><div className="panel-header"><div><h3>Spending activity</h3><p>Expense totals by weekday from your dated transactions</p></div><CalendarDays size={17}/></div><div className="chart-legend"><span><i className="dot purple-dot"/> Spending</span></div>
                <div className="area-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weekly} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}><defs><linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.23}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#292a34" vertical={false}/><XAxis dataKey="day" stroke="#777987" tickLine={false}/><YAxis
  width={85}
  tickMargin={8}
  tickFormatter={(value) =>
    `₹${Number(value).toLocaleString("en-IN")}`
  }
/><Tooltip formatter={v => money(v)} contentStyle={{ background:"#171923", border:"1px solid #2b2e3c", borderRadius:12, color:"#fff" }}/><Area type="monotone" dataKey="expense" stroke="#9b7afa" strokeWidth={2.5} fill="url(#spendFill)"/></AreaChart></ResponsiveContainer></div>
              </div>
              <div className="panel category-panel"><div className="panel-header"><div><h3>Where it goes</h3><p>Spending by category</p></div></div>
                {categories.length ? <><div className="donut-wrap"><ResponsiveContainer width="100%" height={170}><PieChart><Pie data={categories} dataKey="amount" nameKey="name" innerRadius={55} outerRadius={75} paddingAngle={4} stroke="none">{categories.map(c => <Cell key={c.name} fill={c.color}/>)}</Pie><Tooltip formatter={v => money(v)} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{money(expenses)}</strong><span>Total spent</span></div></div><div className="category-legend">{categories.map(c => <div className="category-row" key={c.name}><span><i style={{background:c.color}}/>{c.name}</span><strong>{money(c.amount)}</strong></div>)}</div></> : <p className="empty-state">Add or import expenses to see your category breakdown.</p>}
              </div>
            </section>

            <section className="panel full-panel recurring-panel">
              <div className="panel-header">
                <div>
                  <h3>Recurring payments</h3>
                  <p>Subscriptions and repeated expenses detected by MoneyMind</p>
                </div>
                <span className="live-badge">AI DETECTED</span>
              </div>

              {recurringPayments.length > 0 ? (
                <>
                  <div className="recurring-total">
                    <span>Estimated monthly recurring cost</span>
                    <h2>
                      {money(
                        recurringPayments.reduce(
                          (sum, item) => sum + (Number(item.monthly_estimate) || 0), 0
                        )
                      )}
                    </h2>
                  </div>

                  <div className="transaction-list">
                    {recurringPayments.map((item) => (
                      <div className="transaction-row" key={item.merchant}>
                        <div className="transaction-icon purple">
                          <Wallet size={18} />
                        </div>

                        <div className="transaction-info">
                          <strong>{item.merchant}</strong>
                          <span>
                            {item.frequency} · {item.occurrences} payments
                          </span>
                        </div>

                        <strong className="transaction-amount">
                          {item.monthly_estimate != null
                            ? `${money(item.monthly_estimate)}/mo`
                            : "Not estimated"}
                        </strong>

                        {item.price_changed && (
                          <span className="live-badge">Price changed</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="empty-state">
                  No recurring payments detected yet. Import transactions
                  covering at least two payment dates for the same merchant.
                </p>
              )}
            </section>
            
            <section className="panel full-panel">
              <div className="panel-header">
                <div>
                  <h3>Spending drift alerts</h3>
                  <p>Categories where your spending has increased</p>
                </div>
                <span className="live-badge">MONTHLY ANALYSIS</span>
              </div>

              {spendingDrift.length > 0 ? (
                <div className="transaction-list">
                  {spendingDrift.map((item) => (
                    <div className="transaction-row" key={item.category}>
                      <div className="transaction-icon purple">
                        <TrendingUp size={18} />
                      </div>

                      <div className="transaction-info">
                        <strong>{item.category}</strong>
                        <span>
                          {item.previous === 0
                            ? "New spending in this period"
                            : `Previous: ${money(item.previous)}`}
                        </span>
                      </div>

                      <div className="transaction-amount">
                        <strong>{money(item.current)}</strong>
                        <span className="live-badge">
                          {item.change === null
                            ? "New"
                            : `↑ ${item.change.toFixed(1)}%`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">
                  No significant spending increases detected.
                  Add transactions from the previous month to compare.
                </p>
              )}
            </section>
            <section className="panel full-panel">
              <div className="panel-header">
                <div>
                  <h3>Monthly Financial Health Report</h3>
                  <p>Your financial performance at a glance</p>
                  <input
                      type="month"
                      value={reportMonth}
                      onChange={(e) => setReportMonth(e.target.value)}
                    />
                </div>
                <button className="primary-button" onClick={downloadMonthlyReport}>
                  Download PDF
                </button>
                <span className="live-badge">MONTHLY REPORT</span>
              </div>

              <div className="stats-grid compact-stats">
                <div className="stat-card">
                  <span>Monthly income</span>
                  <h2>{money(monthlyReport.income)}</h2>
                </div>

                <div className="stat-card">
                  <span>Total expenses</span>
                  <h2>{money(monthlyReport.expenses)}</h2>
                </div>

                <div className="stat-card">
                  <span>Money saved</span>
                  <h2>{money(monthlyReport.savings)}</h2>
                </div>

                <div className="stat-card">
                  <span>Savings rate</span>
                  <h2>{monthlyReport.savingsRate.toFixed(1)}%</h2>
                </div>
              </div>

              <div className="profile-summary">
                <span>Highest spending category</span>
                <strong>
                  {monthlyReport.topCategory} · {money(monthlyReport.topAmount)}
                </strong>
              </div>

              <p className="empty-state">
                {monthlyReport.savingsRate >= 30
                  ? "Great work! Your savings rate is looking healthy. Keep building your savings."
                  : "Try reviewing your expenses and setting a realistic monthly savings target."}
              </p>
            </section>
            <section className="bottom-grid">
              <div className="panel transactions-panel"><div className="panel-header"><div><h3>Recent transactions</h3><p>Your latest money movements</p></div><button className="text-button" onClick={() => setPage("Transactions")}>View all <ChevronRight size={14}/></button></div>
                <TransactionList transactions={[...dashboardTransactions].sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0,6)} onEdit={openEditTransaction} onDelete={deleteTransaction}/>
              </div>
              <div className="panel goals-panel"><div className="panel-header"><div><h3>Your goals</h3><p>Dream big, plan smart</p></div><button className="text-button" onClick={() => setPage("Goals")}>View all</button></div>
                {goals.slice(0,2).map(g => <GoalCard key={g.id} goal={g}/>)}
                <button className="add-goal" onClick={openNewGoal}><Plus size={15}/> Add a goal</button>
              </div>
            </section>
            <section className="ai-section"><div className="ai-heading"><div className="ai-orb"><Sparkles size={19}/></div><div><h3>Your AI money coach</h3><p>A little insight can make a big difference.</p></div><span className="live-badge">● AI ACTIVE</span></div>
              <div className="ai-content"><div className="insight-card"><span className="insight-label">✦ YOUR SPENDING INSIGHT</span><h3>{foodSpend > 0 ? "Your food spending is on our radar." : "Let's build your spending picture."}</h3><p>{foodSpend > 0 ? <>You've spent {money(foodSpend)} on food & dining. Reducing it by 20% could free up <strong>{money(potentialFoodSavings)}</strong> towards your goals.</> : "Add or import transactions to unlock personalized spending insights."}</p><button className="insight-action" onClick={() => sendMessage("How can I reduce my food spending?")}>Explore savings <ChevronRight size={15}/></button></div>
                <ChatPanel chat={chat} message={message} setMessage={setMessage} loading={chatLoading} onSend={() => sendMessage()} onSuggestion={sendMessage}/>
              </div>
            </section>
            <div className="disclaimer">MoneyMind AI is for educational purposes and budgeting support only, not financial advice.</div>
            </> ) : null}

          {page === "Transactions" && <>
            <div className="page-title-row"><div><div className="eyebrow">YOUR MONEY MOVEMENTS</div><h1>Transactions</h1><p className="subtitle">Add, edit, search and remove your income and expenses.</p></div>
            <div className="header-buttons">
              <button
                className="delete-all-button"
                onClick={deleteAllTransactions}
                disabled={transactions.length === 0}
              >
                <Trash2 size={16}/> Delete All
              </button>

              <label className="upload-button">
                <Upload size={16}/> Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleCSVUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>

                            <button className="primary-button" onClick={openNewTransaction}>
                <Plus size={17}/> Add transaction
              </button>
            </div>
            </div>

            {importMessage && <div className="import-message"><CheckCircle2 size={16}/>{importMessage}<button onClick={() => setImportMessage("")}><X size={15}/></button></div>}
            <div className="stats-grid compact-stats"><div className="stat-card"><div className="stat-top">Income</div><h2>{money(allIncome)}</h2></div><div className="stat-card"><div className="stat-top">Expenses</div><h2>{money(allExpenses)}</h2></div><div className="stat-card"><div className="stat-top">Transactions</div><h2>{transactions.length}</h2></div><div className="stat-card"><div className="stat-top">Net cash flow</div><h2>{allSavings < 0 ? "-" : ""}{money(allSavings)}</h2></div></div>
            <div className="panel full-panel"><div className="panel-header"><div><h3>All transactions</h3><p>{filteredTransactions.length} matching records</p></div><div className="table-search"><Search size={15}/><input placeholder="Filter by name or category" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><TransactionList transactions={[...filteredTransactions].sort((a,b)=>String(b.date).localeCompare(String(a.date)))} onEdit={openEditTransaction} onDelete={deleteTransaction}/>{!filteredTransactions.length && <p className="empty-state">No transactions match your search.</p>}</div>
          </>}

          {page === "Goals" && <>
            <div className="page-title-row"><div><div className="eyebrow">PLAN FOR WHAT MATTERS</div><h1>Your goals</h1><p className="subtitle">Track your savings targets and update progress anytime.</p></div><button className="primary-button" onClick={openNewGoal}><Plus size={17}/> Add a goal</button></div>
            <div className="goal-grid">{goals.map(g => <div className="panel goal-detail" key={g.id}><div className="goal-detail-actions"><button onClick={() => openEditGoal(g)} aria-label="Edit goal"><Pencil size={16}/></button><button onClick={() => deleteGoal(g.id)} aria-label="Delete goal"><Trash2 size={16}/></button></div><div className="goal-icon large">{g.icon || "🎯"}</div><h3>{g.name}</h3><p className="muted-text">{g.dueDate ? `Target date: ${new Date(`${g.dueDate}T12:00:00`).toLocaleDateString("en-IN", { month:"short", year:"numeric" })}` : "No target date set"}</p><div className="goal-amount"><strong>{money(g.saved)}</strong><span>of {money(g.target)}</span></div><div className="progress-track"><div style={{width:`${Math.min(100, g.target > 0 ? g.saved/g.target*100 : 0)}%`}}/></div><div className="goal-percent">{Math.round(g.target > 0 ? g.saved/g.target*100 : 0)}% completed</div><button className="add-goal" onClick={() => openEditGoal(g)}>Update progress</button></div>)}
              {!goals.length && <div className="panel empty-state"><Target size={28}/><h3>No goals yet</h3><p>Create a savings goal to start tracking your progress.</p><button className="primary-button" onClick={openNewGoal}><Plus size={16}/> Create your first goal</button></div>}</div>
          </>}
            
          {page === "Financial Profile" && (
            <section className="page-content">
              <div className="page-title-row">
                <div>
                  <div className="eyebrow">YOUR FINANCIAL FOUNDATION</div>
                  <h1>Financial Profile</h1>
                  <p className="subtitle">
                    Manage your income, fixed expenses and savings targets.
                  </p>
                </div>
              </div>

              <div className="panel full-panel">
                <div className="panel-header">
                  <div>
                    <h3>Income and expenses</h3>
                    <p>Your financial details are saved automatically.</p>
                  </div>
                </div>

                <div className="profile-form-grid">
                  {[
                    ["monthlyIncome", "Monthly income"],
                    ["rent", "Monthly rent"],
                    ["utilities", "Utilities and bills"],
                    ["otherExpenses", "Other fixed expenses"],
                    ["emergencyFund", "Current emergency fund"],
                    ["savingsTarget", "Savings target"],
                  ].map(([key, label]) => (
                    <label className="profile-field" key={key}>
                      <span>{label} (₹)</span>
                      <input
                        type="number"
                        min="0"
                        value={profile[key]}
                        onChange={(e) =>
                          setProfile((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        placeholder="Enter amount"
                      />
                    </label>
                  ))}
                </div>

                <div className="profile-summary">
                  <span>Total fixed monthly expenses</span>
                  <strong>
                    {money(
                      Number(profile.rent || 0) +
                      Number(profile.utilities || 0) +
                      Number(profile.otherExpenses || 0)
                    )}
                  </strong>
                </div>
              </div>
            </section>
          )}

        </div>
      </main>

      {transactionModal && <Modal title={editingTransaction ? "Edit transaction" : "Add transaction"} onClose={() => setTransactionModal(false)}><form className="modal-form" onSubmit={saveTransaction}>
        <label>Description<input
          required
          value={txForm.name}
          onChange={e => {
            const name = e.target.value;
            const hasRule = categoryRules.some(r =>
              r.keyword && name.toLowerCase().includes(r.keyword.toLowerCase())
            );

            setTxForm(prev => ({
              ...prev,
              name,
              category: hasRule ? categorize(name, categoryRules) : prev.category
            }));
          }}
          placeholder="e.g. Monthly rent"
        /></label>
        <div className="form-two"><label>Amount (₹)<input required type="number" min="0.01" step="0.01" value={txForm.amount} onChange={e=>setTxForm({...txForm,amount:e.target.value})} placeholder="12000"/></label><label>Date<input type="date" value={txForm.date} onChange={e=>setTxForm({...txForm,date:e.target.value})}/></label></div>
        <label>Type<select value={txForm.type} onChange={e=>setTxForm({...txForm,type:e.target.value,category:e.target.value==="income"?"Income":(txForm.category==="Income"?"Food & dining":txForm.category)})}><option value="expense">Expense</option><option value="income">Income</option></select></label>
        {txForm.type === "expense" && <label>Category<select value={txForm.category} onChange={e=>setTxForm({...txForm,category:e.target.value})}>{["Food & dining","Transport","Shopping","Housing","Bills","Health","Other"].map(c=><option key={c}>{c}</option>)}</select></label>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setTransactionModal(false)}>Cancel</button><button className="primary-button" type="submit">Save transaction</button></div>
      </form></Modal>}

      {goalModal && <Modal title={editingGoal ? "Edit goal" : "Create a goal"} onClose={() => setGoalModal(false)}><form className="modal-form" onSubmit={saveGoal}>
        <label>Goal name<input required value={goalForm.name} onChange={e=>setGoalForm({...goalForm,name:e.target.value})} placeholder="e.g. New laptop"/></label>
        <div className="form-two"><label>Target amount (₹)<input required type="number" min="1" value={goalForm.target} onChange={e=>setGoalForm({...goalForm,target:e.target.value})}/></label><label>Already saved (₹)<input type="number" min="0" value={goalForm.saved} onChange={e=>setGoalForm({...goalForm,saved:e.target.value})}/></label></div>
        <div className="form-two"><label>Target date<input type="date" value={goalForm.dueDate} onChange={e=>setGoalForm({...goalForm,dueDate:e.target.value})}/></label><label>Emoji<input value={goalForm.icon} onChange={e=>setGoalForm({...goalForm,icon:e.target.value})} maxLength={4}/></label></div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setGoalModal(false)}>Cancel</button><button className="primary-button" type="submit">Save goal</button></div>
      </form></Modal>}
    </div>
  );
}

function TransactionList({ transactions, onEdit, onDelete }) {
  if (!transactions.length) return <p className="empty-state">No transactions yet. Add one or import a CSV file.</p>;
  return <div className="transaction-list">{transactions.map(t => <div className="transaction-row" key={t.id || `${t.name}-${t.date}-${t.amount}`}>
    <div className={`transaction-icon ${t.amount > 0 ? "green" : "purple"}`}><Wallet size={18}/></div>
    <div className="transaction-info"><strong>{t.name}</strong><span>{t.category} · {t.date}</span></div>
    <strong className={`transaction-amount ${t.amount > 0 ? "income" : ""}`}>{t.amount > 0 ? "+" : "-"}{money(t.amount)}</strong>
    <div className="row-actions"><button onClick={()=>onEdit(t)} aria-label={`Edit ${t.name}`}><Pencil size={15}/></button><button onClick={()=>onDelete(t.id)} aria-label={`Delete ${t.name}`}><Trash2 size={15}/></button></div>
  </div>)}</div>;
}

function GoalCard({ goal }) {
  const percent = Math.min(100, goal.target > 0 ? goal.saved / goal.target * 100 : 0);
  return <div className="goal-item"><div className="goal-top"><div className="goal-icon">{goal.icon || "🎯"}</div><div><strong>{goal.name}</strong><span>{goal.dueDate ? `Due ${new Date(`${goal.dueDate}T12:00:00`).toLocaleDateString("en-IN",{month:"short",year:"numeric"})}` : "No due date"}</span></div></div><div className="goal-amount"><strong>{money(goal.saved)}</strong><span>of {money(goal.target)}</span></div><div className="progress-track"><div style={{width:`${percent}%`}}/></div><div className="goal-percent">{Math.round(percent)}% completed</div></div>;
}

function ChatPanel({ chat, message, setMessage, loading, onSend, onSuggestion }) {
  return <div className="chat-card"><div className="chat-messages">{chat.map((c,i)=><div key={i} className={`chat-bubble ${c.role}`}>{c.role==="ai" && <Sparkles size={13}/>}<span>{c.text}</span></div>)}{loading && <div className="chat-bubble ai"><Sparkles size={13}/><span>Analyzing your finances...</span></div>}</div><div className="chat-input-row"><input placeholder="Ask about your money..." value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==="Enter" && onSend()}/><button onClick={onSend} disabled={loading || !message.trim()} aria-label="Send message"><Send size={16}/></button></div><div className="chat-suggestions"><button onClick={()=>onSuggestion("How can I save more?")}>How can I save more?</button><button onClick={()=>onSuggestion("What if my rent increases by 10%?")}>What if rent increases?</button></div></div>;
}

function Modal({ title, onClose, children }) {
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget) onClose();}}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><button onClick={onClose} aria-label="Close"><X size={19}/></button></div>{children}</section></div>;
}

export default App;
