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
    const diffResult = [];

    const escapeHtml = (unsafe) => {
        return (unsafe || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    };

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && eWords[i - 1] === aWords[j - 1]) {
            diffResult.push(`<span>${escapeHtml(eWords[i - 1])}</span>`);
            i--;
            j--;
        } else if (j > 0 && (i === 0 || lcsMatrix[i][j - 1] >= lcsMatrix[i - 1][j])) {
            diffResult.push(`<ins class="diff-added">${escapeHtml(aWords[j - 1])}</ins>`);
            j--;
        } else if (i > 0 && (j === 0 || lcsMatrix[i][j - 1] < lcsMatrix[i - 1][j])) {
            diffResult.push(`<del class="diff-removed">${escapeHtml(eWords[i - 1])}</del>`);
            i--;
        }
    }

    return diffResult.reverse().join(' ');
}
