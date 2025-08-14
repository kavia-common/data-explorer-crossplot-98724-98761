//
// Arithmetic expression utilities for evaluating derived numeric variables
// Supports identifiers (dataset column names), numbers, + - * / and parentheses.
// Provides validation against available numeric variables and safe evaluation per row.
//

/**
 * Map an identifier to the exact dataset key by case-insensitive match.
 */
function mapIdentifierCaseInsensitive(id, numericOptions = []) {
  const target = String(id || '').toLowerCase();
  for (const k of numericOptions) {
    if (String(k).toLowerCase() === target) return k;
  }
  return null;
}

/**
 * Tokenize an arithmetic expression into identifiers, numbers, operators and parentheses.
 * Returns array of { type: 'id'|'num'|'op'|'lp'|'rp', value: string }
 */
function tokenize(expr) {
  const s = String(expr || '').trim();
  const tokens = [];
  const re = /([A-Za-z_][A-Za-z0-9_]*)|(\d*\.?\d+(?:[eE][+\-]?\d+)?)|([+\-*/()])/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[1]) tokens.push({ type: 'id', value: m[1] });
    else if (m[2]) tokens.push({ type: 'num', value: m[2] });
    else if (m[3]) {
      const ch = m[3];
      if (ch === '(') tokens.push({ type: 'lp', value: ch });
      else if (ch === ')') tokens.push({ type: 'rp', value: ch });
      else tokens.push({ type: 'op', value: ch }); // + - * /
    }
  }
  return tokens;
}

/**
 * Convert tokens to Reverse Polish Notation using Shunting-yard algorithm.
 * Handles basic operator precedence and left associativity.
 * Handles unary minus by inserting 0 before a minus when appropriate.
 */
function toRPN(tokens) {
  const output = [];
  const ops = [];
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2 };

  let prevType = 'op'; // treat start as after an operator to detect leading unary -
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'num' || t.type === 'id') {
      output.push(t);
      prevType = t.type;
    } else if (t.type === 'op') {
      // Handle unary minus: if previous token type is operator or left paren or start, transform "-x" => "0 - x"
      if (t.value === '-' && (prevType === 'op' || prevType === 'lp' || prevType === 'start')) {
        // Insert a 0 before minus
        output.push({ type: 'num', value: '0' });
      }
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.type === 'op' && prec[top.value] >= prec[t.value]) {
          output.push(ops.pop());
        } else break;
      }
      ops.push(t);
      prevType = 'op';
    } else if (t.type === 'lp') {
      ops.push(t);
      prevType = 'lp';
    } else if (t.type === 'rp') {
      let found = false;
      while (ops.length) {
        const top = ops.pop();
        if (top.type === 'lp') {
          found = true;
          break;
        }
        output.push(top);
      }
      if (!found) throw new Error('Parentheses mismatch');
      prevType = 'rp';
    }
  }
  while (ops.length) {
    const top = ops.pop();
    if (top.type === 'lp' || top.type === 'rp') throw new Error('Parentheses mismatch');
    output.push(top);
  }
  return output;
}

/**
 * Evaluate RPN tokens with a variable resolver function.
 * resolver(name) should return a number (may be NaN).
 */
function evalRPN(rpn, resolver) {
  const stack = [];
  for (const t of rpn) {
    if (t.type === 'num') {
      stack.push(Number(t.value));
    } else if (t.type === 'id') {
      const v = resolver(t.value);
      stack.push(v);
    } else if (t.type === 'op') {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return NaN;
      switch (t.value) {
        case '+': stack.push(a + b); break;
        case '-': stack.push(a - b); break;
        case '*': stack.push(a * b); break;
        case '/': stack.push(b === 0 ? NaN : a / b); break;
        default: return NaN;
      }
    }
  }
  if (stack.length !== 1) return NaN;
  return stack[0];
}

/**
 * PUBLIC_INTERFACE
 * Determine if a string looks like an arithmetic expression (contains operators or parentheses).
 */
export function isArithmeticExpression(s) {
  const str = String(s || '');
  return /[+\-*/()]/.test(str);
}

/**
 * PUBLIC_INTERFACE
 * Validate an arithmetic expression against available numeric variables.
 * Returns { valid: boolean, missing: string[], used: string[] }
 * Identifiers are checked case-insensitively against numericOptions.
 */
export function validateExpression(expr, numericOptions = []) {
  const tokens = tokenize(expr);
  const missing = new Set();
  const used = new Set();
  try {
    for (const t of tokens) {
      if (t.type === 'id') {
        const mapped = mapIdentifierCaseInsensitive(t.value, numericOptions);
        if (!mapped) {
          missing.add(t.value);
        } else {
          used.add(mapped);
        }
      }
    }
    // Basic syntactic check by attempting to convert to RPN
    toRPN(tokens);
  } catch {
    return { valid: false, missing: Array.from(missing), used: Array.from(used) };
  }
  return { valid: missing.size === 0, missing: Array.from(missing), used: Array.from(used) };
}

/**
 * PUBLIC_INTERFACE
 * Evaluate an arithmetic expression on a given row object using provided numericOptions
 * for case-insensitive identifier resolution. Returns a number (NaN if invalid).
 */
export function evaluateExpressionOnRow(expr, row, numericOptions = []) {
  try {
    const tokens = tokenize(expr);
    const rpn = toRPN(tokens);
    const resolver = (name) => {
      const key = mapIdentifierCaseInsensitive(name, numericOptions) || name;
      const v = row?.[key];
      if (v == null) return NaN;
      const num = typeof v === 'number' ? v : Number(String(v).trim());
      return Number.isFinite(num) ? num : NaN;
    };
    const val = evalRPN(rpn, resolver);
    return Number.isFinite(val) ? val : NaN;
  } catch {
    return NaN;
  }
}
