"use strict";

const byId = (id) => document.getElementById(id);
const decisions = ["Approve", "Reject", "Request changes"];
const mailtoLimit = 1800;
let downloadUrl;

function renderPost(post) {
  const card = byId("post-template").content.firstElementChild.cloneNode(true);
  card.id = post.id;
  const heading = card.querySelector("h3");
  heading.id = post.id + "-title";
  heading.textContent = post.title;
  card.setAttribute("aria-labelledby", heading.id);
  const date = card.querySelector("time");
  date.dateTime = post.date;
  date.textContent = post.dateLabel;
  card.querySelector(".metadata").textContent = [post.type, post.platform, post.series].filter(Boolean).join(" · ");

  const preview = card.querySelector(".preview");
  const image = preview.querySelector("img");
  const imageMat = preview.querySelector(".image-mat");
  const description = preview.querySelector("figcaption");
  function showMissingImage(label, note) {
    imageMat.hidden = true;
    preview.classList.add("missing");
    const title = document.createElement("strong");
    title.textContent = label;
    description.replaceChildren(title, note);
  }
  if (post.image) {
    image.alt = post.title + (post.graphicNeeded ? " draft mockup" : " visual preview");
    image.addEventListener("error", () => showMissingImage("Preview unavailable", post.imageNote));
    image.src = post.image;
    description.textContent = post.imageNote.replace(/^Graphic needed\.\s*/, "");
  } else {
    showMissingImage("Graphic needed", post.imageNote.replace(/^Graphic needed\.\s*/, ""));
  }

  card.querySelector(".caption").textContent = post.caption;
  if (post.existing) {
    const calendarNote = card.querySelector(".calendar-note");
    calendarNote.textContent = post.existingNote;
    calendarNote.hidden = false;
  }
  if (post.placeholders.length) {
    const confirm = card.querySelector(".confirm");
    for (const placeholder of post.placeholders) {
      const item = document.createElement("li");
      item.textContent = placeholder;
      confirm.querySelector("ul").append(item);
    }
    confirm.hidden = false;
  }

  const choices = card.querySelector(".choices");
  const error = card.querySelector(".error");
  error.id = post.id + "-error";
  const notesLabel = card.querySelector(".notes-label span");
  const notes = card.querySelector(".notes");
  notes.setAttribute("aria-describedby", error.id);
  const radios = decisions.map((decision) => {
    const label = document.createElement("label");
    label.className = "choice";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = post.id;
    radio.value = decision;
    radio.required = true;
    radio.setAttribute("aria-describedby", error.id);
    const text = document.createElement("span");
    text.textContent = decision;
    label.append(radio, text);
    choices.append(label);
    return radio;
  });
  const graphic = card.querySelector(".graphic");
  if (post.graphicNeeded) {
    graphic.value = post.imageNote;
    graphic.closest("label").hidden = false;
  }
  const review = {
    post, card, radios, error, notes, graphic,
    decision: () => radios.find((radio) => radio.checked)?.value
  };
  choices.addEventListener("change", () => {
    notes.required = review.decision() === "Request changes";
    notesLabel.textContent = notes.required ? "What should change? (required)" : "Notes (optional)";
    clearError(review);
  });
  notes.addEventListener("input", () => {
    if (notes.value.trim()) clearError(review);
  });
  return review;
}

function clearError({ error, radios, notes }) {
  error.hidden = true;
  error.textContent = "";
  for (const input of [...radios, notes]) input.removeAttribute("aria-invalid");
}

function validate(reviews) {
  for (const review of reviews) {
    clearError(review);
    const { card, decision, radios, notes, error } = review;
    const selection = decision();
    if (selection && (selection !== "Request changes" || notes.value.trim())) continue;

    error.hidden = false;
    error.textContent = selection ? "Add a note describing the changes for this draft." :
      "Choose Approve, Reject, or Request changes for this draft.";
    const input = selection ? notes : radios[0];
    input.setAttribute("aria-invalid", "true");
    input.focus();
    // Keep the focused control visible below the sticky progress bar.
    const barHeight = document.querySelector(".review-bar").offsetHeight;
    if (input.getBoundingClientRect().top < barHeight + 12) {
      input.scrollIntoView({ block: "center" });
    }
    return false;
  }
  return true;
}

function makeSummary(reviews) {
  const header = [
    "Collins Market post review",
    "Name: " + (byId("name").value.trim() || "Not provided"),
    "Email or phone: " + (byId("contact").value.trim() || "Not provided"),
    "Upcoming downtown events: " + (byId("events").value.trim() || "None provided")
  ];
  const entries = reviews.map(({ post, decision, notes, graphic }) => {
    const lines = [post.dateLabel + ", " + post.date.slice(0, 4) + " | " + post.title, "Decision: " + decision()];
    if (notes.value.trim()) lines.push("Notes: " + notes.value.trim());
    if (post.graphicNeeded && graphic.value.trim()) lines.push("Graphic request: " + graphic.value.trim());
    return lines.join("\n");
  });
  return [header.join("\n"), ...entries].join("\n\n") + "\n";
}

function showSummary(summary, email) {
  const prefix = "mailto:" + email + "?subject=" + encodeURIComponent("Collins Market post review") + "&body=";
  const fullDraft = prefix + encodeURIComponent(summary.replaceAll("\n", "\r\n"));
  const emailDraft = byId("email-draft");
  emailDraft.href = fullDraft.length <= mailtoLimit ? fullDraft : prefix + encodeURIComponent(
    "Hi Cory,\r\n\r\nThe full Collins Market review summary is in my clipboard or downloaded text file. I'll paste it here or attach the file before sending."
  );

  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(new Blob([summary], { type: "text/plain;charset=utf-8" }));
  byId("download").href = downloadUrl;
  byId("summary").value = summary;
  byId("result").hidden = false;
  byId("result-heading").focus();

  const delivery = byId("delivery");
  const emailStatus = "The page requested an email draft. If it did not open, use Open email draft.";
  const fallback = " You can select the full text below or download it.";
  delivery.textContent = emailStatus + fallback;
  // Start the copy and launch the draft during the original submit gesture.
  navigator.clipboard?.writeText(summary).then(() => {
    delivery.textContent = emailStatus + " The full summary was copied to your clipboard.";
  }).catch(() => {
    delivery.textContent = emailStatus + fallback;
  });
  emailDraft.click();
}

async function init() {
  const response = await fetch("posts.json");
  if (!response.ok) throw new Error("Drafts could not load.");
  const data = await response.json();
  byId("intro").textContent = data.intro.split(" Nothing on this page gets published.")[0];
  const posts = byId("posts");
  const reviews = [];
  let monthKey;
  let section;
  for (const post of data.posts) {
    const key = post.date.slice(0, 7);
    if (key !== monthKey) {
      monthKey = key;
      section = document.createElement("section");
      const heading = document.createElement("h2");
      heading.id = "month-" + key;
      heading.className = "month-heading";
      heading.textContent = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" })
        .format(new Date(post.date));
      section.setAttribute("aria-labelledby", heading.id);
      section.append(heading);
      posts.append(section);
    }
    const review = renderPost(post);
    reviews.push(review);
    section.append(review.card);
  }

  const form = byId("review");
  const progress = byId("progress");
  progress.max = reviews.length;
  function updateCount() {
    const total = reviews.filter(({ decision }) => decision()).length;
    progress.value = total;
    byId("count").textContent = total + " of " + reviews.length + " reviewed";
  }
  posts.addEventListener("change", (event) => {
    if (event.target.type === "radio") updateCount();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (validate(reviews)) showSummary(makeSummary(reviews), data.submitEmail);
  });
  updateCount();
  form.hidden = false;
}

init().catch(() => {
  byId("count").textContent = "Drafts unavailable";
  const message = byId("load-error");
  message.textContent = "The drafts could not load. Open this page on a static server and refresh.";
  message.hidden = false;
});
