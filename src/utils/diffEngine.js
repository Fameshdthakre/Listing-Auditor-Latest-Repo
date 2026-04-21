const escapeHtml = (unsafe) => {
    return (unsafe || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

function buildLcsMatrix(expectedWords, actualWords) {
    const lcsMatrix = Array(expectedWords.length + 1)
        .fill(null)
        .map(() => Array(actualWords.length + 1).fill(0));

    for (let i = 1; i <= expectedWords.length; i++) {
        for (let j = 1; j <= actualWords.length; j++) {
            if (expectedWords[i - 1] === actualWords[j - 1]) {
                lcsMatrix[i][j] = lcsMatrix[i - 1][j - 1] + 1;
            } else {
                lcsMatrix[i][j] = Math.max(lcsMatrix[i - 1][j], lcsMatrix[i][j - 1]);
            }
        }
    }

    return lcsMatrix;
}

function buildDiffSegments(expectedWords, actualWords, lcsMatrix) {
    let i = expectedWords.length;
    let j = actualWords.length;
    const operations = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && expectedWords[i - 1] === actualWords[j - 1]) {
            operations.push({ type: "equal", word: expectedWords[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || lcsMatrix[i][j - 1] >= lcsMatrix[i - 1][j])) {
            operations.push({ type: "add", word: actualWords[j - 1] });
            j--;
        } else {
            operations.push({ type: "remove", word: expectedWords[i - 1] });
            i--;
        }
    }

    const segments = [];
    for (const operation of operations.reverse()) {
        const lastSegment = segments[segments.length - 1];

        if (operation.type === "equal") {
            if (lastSegment?.type === "equal") {
                lastSegment.expected.push(operation.word);
                lastSegment.actual.push(operation.word);
            } else {
                segments.push({
                    type: "equal",
                    expected: [operation.word],
                    actual: [operation.word],
                });
            }
            continue;
        }

        if (lastSegment && lastSegment.type !== "equal") {
            if (operation.type === "add") {
                lastSegment.actual.push(operation.word);
            } else {
                lastSegment.expected.push(operation.word);
            }

            lastSegment.type = lastSegment.expected.length && lastSegment.actual.length
                ? "replace"
                : (lastSegment.actual.length ? "add" : "remove");
            continue;
        }

        segments.push({
            type: operation.type,
            expected: operation.type === "remove" ? [operation.word] : [],
            actual: operation.type === "add" ? [operation.word] : [],
        });
    }

    return segments;
}

function renderDiffCell(text, type) {
    if (!text) {
        return '<span class="split-diff-empty" aria-hidden="true">&nbsp;</span>';
    }

    const escapedText = escapeHtml(text);
    switch (type) {
        case "added":
            return `<ins class="split-diff-text diff-added diff-ins">${escapedText}</ins>`;
        case "removed":
            return `<del class="split-diff-text diff-removed diff-del">${escapedText}</del>`;
        default:
            return `<span class="split-diff-text">${escapedText}</span>`;
    }
}

export function generateTextDiff(expectedStr, actualStr, options = {}) {
    const expectedWords = (expectedStr || "").split(/\s+/).filter(Boolean);
    const actualWords = (actualStr || "").split(/\s+/).filter(Boolean);
    const lcsMatrix = buildLcsMatrix(expectedWords, actualWords);
    const segments = buildDiffSegments(expectedWords, actualWords, lcsMatrix);
    const containerClasses = ["split-diff-container"];

    if (options.compact) {
        containerClasses.push("split-diff-compact");
    }

    const rows = segments.length > 0 ? segments : [{ type: "equal", expected: [], actual: [] }];

    return `
        <div class="${containerClasses.join(" ")}">
            <div class="split-diff-grid">
                <div class="split-diff-header split-diff-header-left">Expected</div>
                <div class="split-diff-header">Actual</div>
                ${rows.map((segment) => {
                    const expectedText = segment.expected.join(" ");
                    const actualText = segment.actual.join(" ");
                    const expectedType = segment.type === "equal" ? "unchanged" : (expectedText ? "removed" : "empty");
                    const actualType = segment.type === "equal" ? "unchanged" : (actualText ? "added" : "empty");

                    return `
                        <div class="split-diff-cell split-diff-cell-left">
                            ${renderDiffCell(expectedText, expectedType)}
                        </div>
                        <div class="split-diff-cell">
                            ${renderDiffCell(actualText, actualType)}
                        </div>
                    `;
                }).join("")}
            </div>
        </div>
    `;
}
