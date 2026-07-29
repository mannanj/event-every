const encoder = new TextEncoder();
export function escapeText(value) {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/\r\n|\r|\n/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");
}
export function foldContentLine(line) {
    if (/[\r\n]/.test(line)) {
        throw new Error("An iCalendar content line cannot contain a line break.");
    }
    const lines = [];
    let content = "";
    let contentBytes = 0;
    let prefix = "";
    let contentLimit = 75;
    for (const character of line) {
        const characterBytes = encoder.encode(character).byteLength;
        if (contentBytes + characterBytes > contentLimit) {
            lines.push(`${prefix}${content}`);
            prefix = " ";
            content = "";
            contentBytes = 0;
            contentLimit = 74;
        }
        content += character;
        contentBytes += characterBytes;
    }
    lines.push(`${prefix}${content}`);
    return lines;
}
export function joinContentLines(lines) {
    const physicalLines = lines.flatMap(foldContentLine);
    return physicalLines.length === 0
        ? ""
        : `${physicalLines.join("\r\n")}\r\n`;
}
//# sourceMappingURL=text.js.map