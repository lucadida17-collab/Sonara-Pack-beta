const fs = require("fs");
const path = require("path");

const CSS_ROOT = path.join(__dirname, "app", "css");

function listCssFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? listCssFiles(entryPath)
      : entry.isFile() && entry.name.endsWith(".css")
        ? [entryPath]
        : [];
  });
}

function skipComment(source, index) {
  const end = source.indexOf("*/", index + 2);
  if (end === -1) {
    throw new Error(`Commentaire CSS non terminé à l’index ${index}.`);
  }
  return end + 2;
}

function skipString(source, index) {
  const quote = source[index];
  let cursor = index + 1;

  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
      continue;
    }

    if (source[cursor] === quote) {
      return cursor + 1;
    }

    cursor += 1;
  }

  throw new Error(`Chaîne CSS non terminée à l’index ${index}.`);
}

function findOpeningBrace(source, index) {
  let cursor = index;

  while (cursor < source.length) {
    if (source.startsWith("/*", cursor)) {
      cursor = skipComment(source, cursor);
      continue;
    }

    if (source[cursor] === '"' || source[cursor] === "'") {
      cursor = skipString(source, cursor);
      continue;
    }

    if (source[cursor] === "{") {
      return cursor;
    }

    cursor += 1;
  }

  throw new Error(`Bloc @media sans accolade ouvrante à l’index ${index}.`);
}

function findClosingBrace(source, openingBrace) {
  let depth = 1;
  let cursor = openingBrace + 1;

  while (cursor < source.length) {
    if (source.startsWith("/*", cursor)) {
      cursor = skipComment(source, cursor);
      continue;
    }

    if (source[cursor] === '"' || source[cursor] === "'") {
      cursor = skipString(source, cursor);
      continue;
    }

    if (source[cursor] === "{") {
      depth += 1;
    } else if (source[cursor] === "}") {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }

    cursor += 1;
  }

  throw new Error(`Bloc @media non terminé à l’index ${openingBrace}.`);
}

function readTopLevelMedia(source) {
  const mediaBlocks = [];
  let depth = 0;
  let cursor = 0;

  while (cursor < source.length) {
    if (source.startsWith("/*", cursor)) {
      cursor = skipComment(source, cursor);
      continue;
    }

    if (source[cursor] === '"' || source[cursor] === "'") {
      cursor = skipString(source, cursor);
      continue;
    }

    if (
      depth === 0 &&
      source.slice(cursor, cursor + 6).toLowerCase() === "@media" &&
      /\s|\(/.test(source[cursor + 6] || "")
    ) {
      const openingBrace = findOpeningBrace(source, cursor + 6);
      const closingBrace = findClosingBrace(source, openingBrace);
      const params = source
        .slice(cursor + 6, openingBrace)
        .trim()
        .replace(/\s+/g, " ");

      mediaBlocks.push({
        start: cursor,
        openingBrace,
        closingBrace,
        end: closingBrace + 1,
        params,
        body: source.slice(openingBrace + 1, closingBrace).trim()
      });

      cursor = closingBrace + 1;
      continue;
    }

    if (source[cursor] === "{") {
      depth += 1;
    } else if (source[cursor] === "}") {
      depth = Math.max(0, depth - 1);
    }

    cursor += 1;
  }

  return mediaBlocks;
}

function consolidateMediaQueries(source) {
  const groups = new Map();

  for (const block of readTopLevelMedia(source)) {
    const blocks = groups.get(block.params) || [];
    blocks.push(block);
    groups.set(block.params, blocks);
  }

  const replacements = [];
  const mergedGroups = [];

  for (const [params, blocks] of groups) {
    if (blocks.length < 2) {
      continue;
    }

    const [first, ...duplicates] = blocks;
    const combinedBody = blocks.map((block) => block.body).join("\n\n");

    replacements.push({
      start: first.start,
      end: first.end,
      value: `@media ${params} {\n${combinedBody}\n}`
    });

    for (const duplicate of duplicates) {
      replacements.push({
        start: duplicate.start,
        end: duplicate.end,
        value: ""
      });
    }

    mergedGroups.push({ params, count: blocks.length });
  }

  let output = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    output =
      output.slice(0, replacement.start) +
      replacement.value +
      output.slice(replacement.end);
  }

  return { output, mergedGroups };
}

let changedFiles = 0;
let mergedGroupCount = 0;

for (const file of listCssFiles(CSS_ROOT)) {
  const source = fs.readFileSync(file, "utf8");
  const { output, mergedGroups } = consolidateMediaQueries(source);

  if (!mergedGroups.length) {
    continue;
  }

  fs.writeFileSync(file, output, "utf8");
  changedFiles += 1;
  mergedGroupCount += mergedGroups.length;

  const relativePath = path.relative(__dirname, file);
  const summary = mergedGroups
    .map(({ params, count }) => `${params} (${count} blocs)`)
    .join(", ");
  console.log(`${relativePath}: ${summary}`);
}

console.log(
  `Fusion terminée : ${mergedGroupCount} breakpoints regroupés dans ${changedFiles} fichiers.`
);
