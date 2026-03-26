const MT5_PLACEHOLDERS = {
  start: "1",
  step: "1",
  stop: "2",
  optimize: "N"
};

const state = {
  convertedText: "",
  outputFileName: "",
  sourceType: "",
  targetType: "",
  originalFileName: ""
};

const elements = {
  chooseFileBtn: document.querySelector("#chooseFileBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  outputPreview: document.querySelector("#outputPreview"),
  statusBanner: document.querySelector("#statusBanner"),
  sourceType: document.querySelector("#sourceType"),
  targetType: document.querySelector("#targetType"),
  lineCount: document.querySelector("#lineCount"),
  conversionNotes: document.querySelector("#conversionNotes")
};

elements.chooseFileBtn.addEventListener("click", () => {
  elements.fileInput.click();
});

elements.fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;

  if (!file) {
    return;
  }

  await handleFile(file);
  elements.fileInput.value = "";
});

elements.downloadBtn.addEventListener("click", () => {
  if (!state.convertedText) {
    return;
  }

  const blob = new Blob([state.convertedText], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = state.outputFileName || "converted.set";
  link.click();
  URL.revokeObjectURL(link.href);
});

elements.copyBtn.addEventListener("click", async () => {
  if (!state.convertedText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(state.convertedText);
    renderStatus("Converted file copied to your clipboard.", "success");
  } catch (error) {
    renderStatus("Clipboard access was blocked. You can still download the converted file.", "error");
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-active");
  });
});

["dragleave", "dragend", "drop"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-active");
  });
});

elements.dropZone.addEventListener("drop", async (event) => {
  const [file] = event.dataTransfer.files;

  if (!file) {
    return;
  }

  await handleFile(file);
  elements.fileInput.value = "";
});

async function handleFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const text = decodeSetFile(arrayBuffer);
    const newline = detectNewline(text);
    const lines = normalizeLines(text);
    const sourceType = detectFormat(lines);
    const targetType = sourceType === "mt4" ? "mt5" : "mt4";
    const convertedText = convertSetFile(lines, sourceType, newline);

    state.convertedText = convertedText;
    state.sourceType = sourceType;
    state.targetType = targetType;
    state.originalFileName = file.name;
    state.outputFileName = buildOutputFileName(file.name, targetType);

    elements.outputPreview.textContent = convertedText;
    elements.sourceType.textContent = sourceType.toUpperCase();
    elements.targetType.textContent = targetType.toUpperCase();
    elements.lineCount.textContent = String(countMeaningfulLines(lines));
    elements.downloadBtn.disabled = false;
    elements.copyBtn.disabled = false;

    if (sourceType === "mt4") {
      elements.conversionNotes.textContent =
        "MT4 to MT5 conversion generated MT5 optimizer placeholders using start 1, step 1, stop 2, and optimize N for numeric inputs.";
    } else {
      elements.conversionNotes.textContent =
        "MT5 to MT4 conversion kept the live value from each MT5 row and removed optimizer metadata from the output.";
    }

    renderStatus(
      `${file.name} detected as ${sourceType.toUpperCase()} and converted to ${targetType.toUpperCase()}.`,
      "success"
    );
  } catch (error) {
    state.convertedText = "";
    state.outputFileName = "";
    elements.outputPreview.textContent = "Unable to parse that file. Please check that it is a valid MT4 or MT5 .set file.";
    elements.sourceType.textContent = "Error";
    elements.targetType.textContent = "Waiting";
    elements.lineCount.textContent = "0";
    elements.downloadBtn.disabled = true;
    elements.copyBtn.disabled = true;
    elements.conversionNotes.textContent =
      "MT4 files use name=value rows, while MT5 rows can include value||start||step||stop||Y/N metadata.";
    renderStatus(error.message || "Conversion failed.", "error");
  }
}

function decodeSetFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }

  let oddByteZeroCount = 0;
  let inspectedOddBytes = 0;

  for (let index = 1; index < Math.min(bytes.length, 4096); index += 2) {
    inspectedOddBytes += 1;

    if (bytes[index] === 0) {
      oddByteZeroCount += 1;
    }
  }

  if (inspectedOddBytes > 0 && oddByteZeroCount / inspectedOddBytes > 0.3) {
    return new TextDecoder("utf-16le").decode(bytes);
  }

  return new TextDecoder("utf-8").decode(bytes);
}

function detectNewline(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeLines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function detectFormat(lines) {
  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith(";")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const rhs = line.slice(separatorIndex + 1);

    if (rhs.includes("||")) {
      return "mt5";
    }
  }

  return "mt4";
}

function convertSetFile(lines, sourceType, newline) {
  const convertedLines = sourceType === "mt4" ? convertMt4ToMt5(lines) : convertMt5ToMt4(lines);
  return `${convertedLines.join(newline).replace(/\s+$/, "")}${newline}`;
}

function convertMt5ToMt4(lines) {
  const output = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith(";")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      output.push(line);
      continue;
    }

    const key = line.slice(0, separatorIndex);
    const rhs = line.slice(separatorIndex + 1);
    const value = rhs.includes("||") ? rhs.split("||")[0] : rhs;

    output.push(`${key}=${value}`);
  }

  return output;
}

function convertMt4ToMt5(lines) {
  const output = [
    "; generated by Borea Labs MT4/MT5 Set Converter",
    "; MT4 numeric inputs were expanded with MT5 placeholders",
    `; placeholder optimizer fields: ${MT5_PLACEHOLDERS.start}||${MT5_PLACEHOLDERS.step}||${MT5_PLACEHOLDERS.stop}||${MT5_PLACEHOLDERS.optimize}`
  ];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith(";")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      output.push(line);
      continue;
    }

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);

    if (shouldKeepPlainMt5Value(value)) {
      output.push(`${key}=${value}`);
      continue;
    }

    output.push(
      `${key}=${value}||${MT5_PLACEHOLDERS.start}||${MT5_PLACEHOLDERS.step}||${MT5_PLACEHOLDERS.stop}||${MT5_PLACEHOLDERS.optimize}`
    );
  }

  return output;
}

function shouldKeepPlainMt5Value(value) {
  return value === "" || isDecorativeValue(value) || !isNumericLike(value);
}

function isDecorativeValue(value) {
  return value.startsWith("~~~") || value.startsWith("---");
}

function isNumericLike(value) {
  return /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim());
}

function countMeaningfulLines(lines) {
  return lines.filter((line) => line.trim() !== "" && !line.trim().startsWith(";")).length;
}

function buildOutputFileName(originalName, targetType) {
  const extensionPattern = /\.set$/i;
  const baseName = extensionPattern.test(originalName)
    ? originalName.replace(extensionPattern, "")
    : originalName;

  const swappedName = baseName.replace(/mt[45]/gi, targetType.toUpperCase());
  const finalBaseName = swappedName === baseName ? `${baseName}-${targetType}` : swappedName;

  return `${finalBaseName}.set`;
}

function renderStatus(message, stateName) {
  elements.statusBanner.hidden = false;
  elements.statusBanner.textContent = message;
  elements.statusBanner.dataset.state = stateName;
}
