// ============================================================
// IMPORTANT: Replace this URL with your API Gateway endpoint
// e.g. "https://abc123.execute-api.us-east-1.amazonaws.com/prod"
// ============================================================
const API_BASE_URL = "https://7u9ywhkvk0.execute-api.eu-central-1.amazonaws.com/prod";

const noteInput = document.getElementById("noteInput");
const addBtn = document.getElementById("addBtn");
const notesList = document.getElementById("notesList");
const status = document.getElementById("status");

// --- Add a new note ---
async function addNote() {
  const text = noteInput.value.trim();
  if (!text) return;

  addBtn.disabled = true;
  status.textContent = "Sending note...";

  try {
    const res = await fetch(`${API_BASE_URL}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    noteInput.value = "";
    status.textContent = "Note sent! It may take a moment to appear.";

    // Wait briefly for SQS → Lambda → DynamoDB processing, then refresh
    setTimeout(fetchNotes, 2000);
  } catch (err) {
    status.textContent = "Error sending note: " + err.message;
    console.error(err);
  } finally {
    addBtn.disabled = false;
  }
}

// --- Fetch and display all notes ---
async function fetchNotes() {
  status.textContent = "Loading notes...";

  try {
    const res = await fetch(`${API_BASE_URL}/notes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let data = await res.json();
    // Handle case where API Gateway returns the Lambda response wrapper
    if (data && !Array.isArray(data) && data.body) {
      data = typeof data.body === "string" ? JSON.parse(data.body) : data.body;
    }
    const notes = Array.isArray(data) ? data : [];

    if (notes.length === 0) {
      notesList.innerHTML = '<li class="empty">No notes yet. Add one above!</li>';
    } else {
      notesList.innerHTML = notes
        .map(
          (n) => `
        <li>
          <div class="text">${escapeHtml(n.text)}</div>
          <div class="time">${new Date(n.timestamp).toLocaleString()}</div>
        </li>`
        )
        .join("");
    }

    status.textContent = "";
  } catch (err) {
    status.textContent = "Error loading notes: " + err.message;
    console.error(err);
  }
}

// --- Prevent XSS ---
function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// Allow pressing Enter to submit
noteInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addNote();
});

// Load notes on page load
fetchNotes();
