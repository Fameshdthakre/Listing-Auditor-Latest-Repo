export function generateTextDiff(expectedStr, actualStr) {
    const eWords = (expectedStr || "").split(/\s+/).filter(Boolean);
    const aWords = (actualStr || "").split(/\s+/).filter(Boolean);

    // Basic LCS based diff (Simple O(N*M) implementation for words)
    const lcsMatrix = Array(eWords.length + 1).fill(null).map(() => Array(aWords.length + 1).fill(0));
    for (let i = 1; i <= eWords.length; i++) {
        for (let j = 1; j <= aWords.length; j++) {
            if (eWords[i - 1] === aWords[j - 1]) {
                lcsMatrix[i][j] = lcsMatrix[i - 1][j - 1] + 1;
            } else {
                lcsMatrix[i][j] = Math.max(lcsMatrix[i - 1][j], lcsMatrix[i][j - 1]);
            }
        }
    }

    let i = eWords.length;
    let j = aWords.length;

    const leftCol = [];
    const rightCol = [];

    const escapeHtml = (unsafe) => {
        return (unsafe || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    };

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && eWords[i - 1] === aWords[j - 1]) {
            const word = escapeHtml(eWords[i - 1]);
            leftCol.push(`<span>${word}</span>`);
            rightCol.push(`<span>${word}</span>`);
            i--;
            j--;
        } else if (j > 0 && (i === 0 || lcsMatrix[i][j - 1] >= lcsMatrix[i - 1][j])) {
            const word = escapeHtml(aWords[j - 1]);
            leftCol.push(`<span class="diff-empty"></span>`);
            rightCol.push(`<ins class="diff-added">${word}</ins>`);
            j--;
        } else if (i > 0 && (j === 0 || lcsMatrix[i][j - 1] < lcsMatrix[i - 1][j])) {
            const word = escapeHtml(eWords[i - 1]);
            leftCol.push(`<del class="diff-removed">${word}</del>`);
            rightCol.push(`<span class="diff-empty"></span>`);
            i--;
        }
    }

    leftCol.reverse();
    rightCol.reverse();

    return `
        <div class="split-diff-container">
            <div class="split-diff-col split-diff-left">
                <div class="split-diff-header">Expected</div>
                <div class="split-diff-content">${leftCol.join(' ')}</div>
            </div>
            <div class="split-diff-col split-diff-right">
                <div class="split-diff-header">Actual</div>
                <div class="split-diff-content">${rightCol.join(' ')}</div>
            </div>
        </div>
    `;
}
