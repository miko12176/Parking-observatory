const vehicles = [
  {
    id: 1,
    type: "Passenger car",
    color: "Blue",
    street: "Harbor Street",
    status: "verified",
    x: 62,
    y: 37,
    first: "May 14",
    last: "Today",
    days: 44,
    confirmations: 12,
    confidence: 98,
    plate: "GD-***-42",
    summary: "Observed repeatedly on Harbor Street with high location consistency.",
    history: ["May 14: first community report", "June 2: independent photo confirmation", "Today: location confirmed again"]
  },
  {
    id: 2,
    type: "Camper",
    color: "White",
    street: "Market Lane",
    status: "watch",
    x: 28,
    y: 62,
    first: "April 29",
    last: "Yesterday",
    days: 59,
    confirmations: 9,
    confidence: 91,
    plate: "GDA-***-11",
    summary: "Long-duration camper observation with stable position and consistent vehicle features.",
    history: ["April 29: first sighting", "May 20: second contributor confirmed", "Yesterday: still present"]
  },
  {
    id: 3,
    type: "Van",
    color: "Silver",
    street: "School Road",
    status: "verified",
    x: 42,
    y: 28,
    first: "June 9",
    last: "Today",
    days: 18,
    confirmations: 7,
    confidence: 87,
    plate: "GD-***-80",
    summary: "Commercial vehicle occupying the same block over several school-day observations.",
    history: ["June 9: pending report", "June 13: duplicate merged", "Today: observed by two contributors"]
  },
  {
    id: 4,
    type: "Trailer",
    color: "Gray",
    street: "Depot Avenue",
    status: "watch",
    x: 73,
    y: 57,
    first: "March 31",
    last: "June 25",
    days: 86,
    confirmations: 15,
    confidence: 96,
    plate: "GSP-***-19",
    summary: "Trailer category separated from passenger vehicles for regulation-specific reporting.",
    history: ["March 31: trailer report created", "May 7: moderator merged duplicate", "June 25: last confirmed"]
  },
  {
    id: 5,
    type: "Truck",
    color: "Green",
    street: "Park Row",
    status: "pending",
    x: 48,
    y: 76,
    first: "Today",
    last: "Today",
    days: 1,
    confirmations: 1,
    confidence: 42,
    plate: "GD-***-07",
    summary: "New report awaiting community confirmation and duplicate review.",
    history: ["Today: first report submitted", "Today: AI quality check pending"]
  },
  {
    id: 6,
    type: "Motorcycle",
    color: "Black",
    street: "Harbor Street",
    status: "verified",
    x: 54,
    y: 45,
    first: "June 17",
    last: "Today",
    days: 10,
    confirmations: 5,
    confidence: 78,
    plate: "GD-***-33",
    summary: "Small vehicle counted separately to avoid overstating full-space occupancy.",
    history: ["June 17: first report", "June 22: location confirmed", "Today: still present"]
  },
  {
    id: 7,
    type: "Car with trailer",
    color: "Red",
    street: "Market Lane",
    status: "verified",
    x: 21,
    y: 55,
    first: "May 30",
    last: "June 26",
    days: 28,
    confirmations: 8,
    confidence: 89,
    plate: "GD-***-51",
    summary: "Combined vehicle category flagged for high curb-space impact.",
    history: ["May 30: first report", "June 14: independent confirmation", "June 26: updated timestamp"]
  },
  {
    id: 8,
    type: "Construction vehicle",
    color: "Yellow",
    street: "Depot Avenue",
    status: "pending",
    x: 79,
    y: 42,
    first: "June 24",
    last: "June 24",
    days: 4,
    confirmations: 2,
    confidence: 55,
    plate: "GD-***-65",
    summary: "Pending review because construction vehicles may relate to active works.",
    history: ["June 24: first report", "June 24: category needs moderator review"]
  },
  {
    id: 9,
    type: "Passenger car",
    color: "White",
    street: "School Road",
    status: "verified",
    x: 36,
    y: 35,
    first: "June 1",
    last: "Today",
    days: 26,
    confirmations: 10,
    confidence: 93,
    plate: "GD-***-92",
    summary: "Repeated observation near school entrance during weekdays and weekends.",
    history: ["June 1: first report", "June 11: duplicate avoided", "Today: confirmed again"]
  },
  {
    id: 10,
    type: "Unknown",
    color: "Dark",
    street: "Park Row",
    status: "pending",
    x: 58,
    y: 69,
    first: "June 23",
    last: "June 26",
    days: 4,
    confirmations: 2,
    confidence: 49,
    plate: "Masked",
    summary: "Photo quality is low, so the report remains pending until another confirmation arrives.",
    history: ["June 23: low-light photo", "June 26: location confirmed"]
  },
  {
    id: 11,
    type: "Van",
    color: "White",
    street: "Harbor Street",
    status: "verified",
    x: 68,
    y: 31,
    first: "June 4",
    last: "Today",
    days: 23,
    confirmations: 6,
    confidence: 84,
    plate: "GD-***-17",
    summary: "Commercial vehicle with consistent curb position near the future paid zone.",
    history: ["June 4: first report", "June 19: second contributor", "Today: location confirmed"]
  },
  {
    id: 12,
    type: "Passenger car",
    color: "Black",
    street: "Depot Avenue",
    status: "verified",
    x: 66,
    y: 50,
    first: "June 13",
    last: "June 26",
    days: 14,
    confirmations: 5,
    confidence: 80,
    plate: "GD-***-28",
    summary: "Moderate-duration report included in weekly occupancy calculations.",
    history: ["June 13: first report", "June 18: confirmed", "June 26: last seen"]
  }
];

const ideas = [
  {
    type: "Loading zone",
    title: "Short loading bay near Market Lane shops",
    text: "Create a timed loading space that reduces double parking during morning deliveries.",
    support: 34
  },
  {
    type: "Bike parking",
    title: "Convert one low-turnover corner into bike racks",
    text: "Observation data shows persistent long stays at Park Row while bike demand is visible nearby.",
    support: 28
  },
  {
    type: "Resident parking",
    title: "Pilot permit zone on Harbor Street",
    text: "Use a three-month trial tied to occupancy and turnover metrics rather than anecdotal pressure.",
    support: 52
  }
];

const streetRows = [
  ["Harbor Street", 92, "96%", "34% long"],
  ["Market Lane", 74, "88%", "29% long"],
  ["Depot Avenue", 68, "81%", "31% long"],
  ["School Road", 55, "77%", "18% long"],
  ["Park Row", 49, "71%", "22% long"]
];

let selectedVehicle = vehicles[0];
let activeLayer = "pins";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function renderPins(list = vehicles) {
  const layer = $("#pinsLayer");
  layer.innerHTML = "";
  list.forEach((vehicle) => {
    const pin = document.createElement("button");
    pin.className = `vehicle-pin ${vehicle.status}${vehicle.id === selectedVehicle.id ? " selected" : ""}`;
    pin.style.left = `${vehicle.x}%`;
    pin.style.top = `${vehicle.y}%`;
    pin.textContent = vehicle.type.charAt(0);
    pin.title = `${vehicle.color} ${vehicle.type}, ${vehicle.street}`;
    pin.addEventListener("click", () => selectVehicle(vehicle.id));
    layer.appendChild(pin);
  });
  $("#visibleReports").textContent = list.length;
}

function selectVehicle(id) {
  selectedVehicle = vehicles.find((vehicle) => vehicle.id === id) || vehicles[0];
  $("#selectedStatus").textContent = selectedVehicle.status[0].toUpperCase() + selectedVehicle.status.slice(1);
  $("#selectedStatus").className = `status-pill ${selectedVehicle.status}`;
  $("#selectedName").textContent = `${selectedVehicle.color} ${selectedVehicle.type.toLowerCase()}`;
  $("#selectedSummary").textContent = selectedVehicle.summary;
  $("#selectedFirst").textContent = selectedVehicle.first;
  $("#selectedLast").textContent = selectedVehicle.last;
  $("#selectedDays").textContent = selectedVehicle.days;
  $("#selectedConfirmations").textContent = selectedVehicle.confirmations;
  $("#selectedConfidenceLabel").textContent = `${selectedVehicle.confidence}%`;
  $("#selectedConfidence").style.width = `${selectedVehicle.confidence}%`;
  $("#timeline").innerHTML = selectedVehicle.history.map((item) => `<div class="timeline-item">${item}</div>`).join("");
  renderPins(filteredVehicles());
}

function filteredVehicles() {
  const query = $("#searchInput").value.trim().toLowerCase();
  if (!query) return vehicles;
  return vehicles.filter((vehicle) =>
    [vehicle.type, vehicle.color, vehicle.street, vehicle.status, vehicle.summary]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
}

function renderStreetTable() {
  $("#streetTable").innerHTML = streetRows
    .map(([name, width, occupancy, longTerm]) => `
      <div class="street-row">
        <strong>${name}</strong>
        <div class="row-bar"><span style="--w: ${width}%"></span></div>
        <span>${occupancy}</span>
        <span>${longTerm}</span>
      </div>
    `)
    .join("");
}

function renderIdeas() {
  $("#ideaList").innerHTML = ideas
    .map((idea) => `
      <article class="idea-card">
        <h4>${idea.title}</h4>
        <p>${idea.text}</p>
        <div class="idea-meta"><span>${idea.type}</span><span>${idea.support} residents support</span></div>
      </article>
    `)
    .join("");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function switchView(view) {
  const titles = {
    map: "Interactive Map",
    dashboard: "Parking Dashboard",
    suggestions: "Civic Ideas",
    education: "Education Guide",
    reports: "Reports and Exports",
    admin: "Administration"
  };
  $$(".nav-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  $$(".view").forEach((panel) => panel.classList.remove("active"));
  $(`#${view}View`).classList.add("active");
  $("#viewTitle").textContent = titles[view];
}

function exportCsv() {
  const header = "type,color,street,status,first_observed,last_confirmed,days_parked,confirmations,confidence,public_plate\n";
  const rows = vehicles.map((v) =>
    [v.type, v.color, v.street, v.status, v.first, v.last, v.days, v.confirmations, v.confidence, v.plate]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(",")
  );
  const blob = new Blob([header + rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "parking-observatory-export.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV export prepared with masked public data");
}

function addReport(form) {
  const formData = new FormData(form);
  const vehicle = {
    id: vehicles.length + 1,
    type: formData.get("type"),
    color: formData.get("color") || "Unknown",
    street: formData.get("street"),
    status: "pending",
    x: 30 + Math.round(Math.random() * 44),
    y: 30 + Math.round(Math.random() * 42),
    first: "Today",
    last: "Today",
    days: 1,
    confirmations: 1,
    confidence: 38,
    plate: formData.get("plate") || "Masked",
    summary: formData.get("notes") || "New pending community observation awaiting confirmation.",
    history: ["Today: report submitted", "Today: duplicate and privacy checks queued"]
  };
  vehicles.push(vehicle);
  selectVehicle(vehicle.id);
  $("#reportDialog").close();
  form.reset();
  showToast("Vehicle submitted as pending");
}

function initEvents() {
  $$(".nav-tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));

  $$(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      activeLayer = button.dataset.layer;
      $$(".segmented button").forEach((item) => item.classList.toggle("active", item === button));
      $("#mapCanvas").classList.toggle("show-heat", activeLayer === "heat");
      $("#mapCanvas").classList.toggle("show-zones", activeLayer === "zones");
    });
  });

  $("#searchInput").addEventListener("input", () => renderPins(filteredVehicles()));
  $("#openReport").addEventListener("click", () => $("#reportDialog").showModal());
  $("#exportCsv").addEventListener("click", exportCsv);

  $("#confirmVehicle").addEventListener("click", () => {
    selectedVehicle.confirmations += 1;
    selectedVehicle.confidence = Math.min(99, selectedVehicle.confidence + 3);
    selectedVehicle.last = "Today";
    selectedVehicle.history.unshift("Today: community confirmation added");
    selectVehicle(selectedVehicle.id);
    showToast("Confirmation added to existing vehicle");
  });

  $("#flagVehicle").addEventListener("click", () => showToast("Report sent to moderator review"));
  $("#generatePdf").addEventListener("click", () => showToast("Report preview generated"));
  $("#downloadGis").addEventListener("click", () => showToast("GIS export queued"));

  $("#reportForm").addEventListener("submit", (event) => {
    event.preventDefault();
    addReport(event.currentTarget);
  });

  $("#reportForm").addEventListener("input", () => {
    const formData = new FormData($("#reportForm"));
    const possibleDuplicate =
      String(formData.get("street")).includes("Harbor") &&
      String(formData.get("color")).trim().toLowerCase() === "blue";
    $("#duplicateCard").classList.toggle("visible", possibleDuplicate);
  });

  $("#suggestionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    ideas.unshift({
      type: formData.get("type"),
      title: `${formData.get("type")} proposal for ${formData.get("street") || "the neighborhood"}`,
      text: formData.get("text") || "New civic improvement suggestion submitted for review.",
      support: 1
    });
    renderIdeas();
    event.currentTarget.reset();
    showToast("Idea submitted to the civic board");
  });
}

renderPins();
selectVehicle(1);
renderStreetTable();
renderIdeas();
initEvents();
