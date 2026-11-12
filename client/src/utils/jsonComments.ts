/**
 * Safely strips single-line (//) and multi-line (/* * /) comments from a JSON string.
 * It ignores comment-like strings inside JSON string literals.
 */
export function stripJsonComments(jsonString: string): string {
  // Regex matches: 
  // 1. JSON String literal (capturing group 1)
  // 2. Multi-line comment (capturing group 3)
  // 3. Single-line comment (capturing group 4)
  const regex = /("([^"\\]|\\.)*")|(\/\*[\s\S]*?\*\/)|(\/\/.*$)/gm;
  return jsonString.replace(regex, (_match, stringLiteral, _innerString, multiLineComment, singleLineComment) => {
    if (multiLineComment || singleLineComment) {
      return ''; // Strip the comment
    }
    return stringLiteral; // Keep the string literal intact
  });
}
