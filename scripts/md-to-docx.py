#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/md-to-docx.py — Convertisseur Markdown -> DOCX (Word), SANS dependance externe.

Pourquoi ce script existe
-------------------------
Sur le poste de developpement, `pandoc`, LibreOffice et `python-docx` sont absents.
Ce convertisseur n'utilise QUE la bibliotheque standard de Python (zipfile, re, html,
argparse) et produit un fichier .docx OOXML (WordprocessingML) valide, ouvrable par
Microsoft Word, LibreOffice et Google Docs.

Principe : un .docx est une archive ZIP contenant des fichiers XML. On genere ces XML
a la main a partir d'un sous-ensemble de Markdown que l'on maitrise.

Sous-ensemble Markdown supporte
-------------------------------
  - Titres        : #, ##, ###, ####  -> styles Heading1..4 (navigables dans Word)
  - Paragraphes   : texte libre
  - Listes        : `- ` / `* ` (puces) et `1. ` (numerotees), avec indentation
  - Tableaux      : | col | col |  avec ligne de separation | --- | --- |
  - Emphase       : **gras**, *italique*, `code` (inline)
  - Blocs de code : delimites par ``` (police Consolas, fond gris clair)
  - Regles        : --- (ligne horizontale)
  - Citations     : > texte  (rendu en italique indente)

Limites assumees (v1) : pas d'emphase imbriquee, pas de tableaux imbriques, pas
d'images. Garder le Markdown "discipline" et le rendu sera fidele.

Utilisation
-----------
  # Fichier unique : produit input.docx a cote de input.md
  python scripts/md-to-docx.py docs/soutenance/README.md

  # Concatenation de plusieurs .md en un seul .docx (saut de page entre chaque)
  python scripts/md-to-docx.py --out docs/soutenance/DOSSIER.docx a.md b.md c.md

  # Avec une page de garde
  python scripts/md-to-docx.py --out DOSSIER.docx --title "Titre" --subtitle "..." a.md b.md
"""

import argparse
import html
import os
import re
import sys
import zipfile

# Couleurs de la charte NINA-AES (hex sans #)
PRIMARY = "1B3A5C"
PRIMARY_LIGHT = "274D73"
ACCENT = "2E75B6"
HEADER_FILL = "1B3A5C"
CODE_FILL = "F2F2F2"
RULE_COLOR = "999999"
TABLE_BORDER = "BFBFBF"


def esc(text):
    """Echappe les caracteres XML speciaux (&, <, >)."""
    return html.escape(text, quote=False)


# --------------------------------------------------------------------------- #
# Parsing inline : **gras**, *italique*, `code`                               #
# --------------------------------------------------------------------------- #
_INLINE_RE = re.compile(r"(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)")


def parse_inline(text):
    """Decoupe une chaine en une liste de (texte, style) ou style est un dict
    pouvant contenir bold / italic / code = True."""
    runs = []
    pos = 0
    for m in _INLINE_RE.finditer(text):
        if m.start() > pos:
            runs.append((text[pos : m.start()], {}))
        tok = m.group(0)
        if tok.startswith("`"):
            runs.append((tok[1:-1], {"code": True}))
        elif tok.startswith("**") or tok.startswith("__"):
            runs.append((tok[2:-2], {"bold": True}))
        else:  # *italique* ou _italique_
            runs.append((tok[1:-1], {"italic": True}))
        pos = m.end()
    if pos < len(text):
        runs.append((text[pos:], {}))
    if not runs:
        runs = [(text, {})]
    return runs


def run_xml(text, style=None, color=None):
    """Genere un run Word (<w:r>) avec ses proprietes de formatage."""
    style = style or {}
    props = ""
    if style.get("bold"):
        props += "<w:b/>"
    if style.get("italic"):
        props += "<w:i/>"
    if style.get("code"):
        props += (
            '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>'
            '<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % CODE_FILL
        )
    if color:
        props += '<w:color w:val="%s"/>' % color
    rpr = "<w:rPr>%s</w:rPr>" % props if props else ""
    return '<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (rpr, esc(text))


def runs_xml(runs, color=None):
    return "".join(run_xml(t, s, color=color) for t, s in runs)


# --------------------------------------------------------------------------- #
# Blocs : titres, paragraphes, listes, tableaux, code, regles                  #
# --------------------------------------------------------------------------- #
def heading_xml(level, text):
    return '<w:p><w:pPr><w:pStyle w:val="Heading%d"/></w:pPr>%s</w:p>' % (
        level,
        runs_xml(parse_inline(text)),
    )


def para_xml(runs, ind=0, pstyle=None):
    inner = ""
    if pstyle:
        inner += '<w:pStyle w:val="%s"/>' % pstyle
    if ind:
        inner += '<w:ind w:left="%d"/>' % ind
    ppr = "<w:pPr>%s</w:pPr>" % inner if inner else ""
    return "<w:p>%s%s</w:p>" % (ppr, runs_xml(runs))


def hr_xml():
    return (
        "<w:p><w:pPr><w:pBdr>"
        '<w:bottom w:val="single" w:sz="6" w:space="1" w:color="%s"/>'
        "</w:pBdr></w:pPr></w:p>" % RULE_COLOR
    )


def codeblock_xml(lines):
    out = []
    for ln in lines:
        out.append(
            '<w:p><w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr>'
            '<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr>'
            '<w:t xml:space="preserve">%s</w:t></w:r></w:p>' % esc(ln)
        )
    return "".join(out)


def pagebreak_xml():
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'


def table_xml(rows):
    """rows = liste de lignes, chaque ligne = liste de cellules (str).
    La premiere ligne est traitee comme en-tete (fond bleu, texte blanc gras)."""
    ncol = max(len(r) for r in rows)
    borders = "".join(
        '<w:%s w:val="single" w:sz="4" w:space="0" w:color="%s"/>' % (e, TABLE_BORDER)
        for e in ("top", "left", "bottom", "right", "insideH", "insideV")
    )
    tblpr = (
        "<w:tblPr>"
        '<w:tblStyle w:val="TableGrid"/>'
        '<w:tblW w:w="0" w:type="auto"/>'
        "<w:tblBorders>%s</w:tblBorders>"
        "</w:tblPr>" % borders
    )
    grid = "<w:tblGrid>%s</w:tblGrid>" % ("".join("<w:gridCol/>" for _ in range(ncol)))
    trs = []
    for ri, row in enumerate(rows):
        cells = []
        for ci in range(ncol):
            cell = row[ci] if ci < len(row) else ""
            runs = parse_inline(cell)
            if ri == 0:
                shd = '<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % HEADER_FILL
                body = "".join(
                    run_xml(t, dict(s, bold=True), color="FFFFFF") for t, s in runs
                )
            else:
                shd = ""
                body = runs_xml(runs)
            tcpr = "<w:tcPr>%s</w:tcPr>" % shd
            cells.append(
                "<w:tc>%s<w:p>%s</w:p></w:tc>" % (tcpr, body or "<w:r><w:t/></w:r>")
            )
        trs.append("<w:tr>%s</w:tr>" % "".join(cells))
    return "<w:tbl>%s%s%s</w:tbl>" % (tblpr, grid, "".join(trs))


# --------------------------------------------------------------------------- #
# Conversion d'un document Markdown -> liste de blocs XML                       #
# --------------------------------------------------------------------------- #
_HR_RE = re.compile(r"^\s*([-*_])\1\1+\s*$")
_HEADING_RE = re.compile(r"^(#{1,4})\s+(.*)$")
_BULLET_RE = re.compile(r"^(\s*)[-*]\s+(.*)$")
_NUMBER_RE = re.compile(r"^(\s*)(\d+)\.\s+(.*)$")
_QUOTE_RE = re.compile(r"^>\s?(.*)$")
_TABLE_SEP_RE = re.compile(r"^\s*\|?[\s:|-]+\|?\s*$")


def md_to_blocks(md):
    lines = md.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    body = []
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]

        # Bloc de code ```
        if line.strip().startswith("```"):
            j = i + 1
            buf = []
            while j < n and not lines[j].strip().startswith("```"):
                buf.append(lines[j])
                j += 1
            body.append(codeblock_xml(buf))
            i = j + 1
            continue

        # Ligne vide
        if line.strip() == "":
            i += 1
            continue

        # Titre
        m = _HEADING_RE.match(line)
        if m:
            body.append(heading_xml(len(m.group(1)), m.group(2).strip()))
            i += 1
            continue

        # Regle horizontale
        if _HR_RE.match(line):
            body.append(hr_xml())
            i += 1
            continue

        # Tableau (ligne courante + ligne de separation avec des tirets)
        if (
            line.lstrip().startswith("|")
            and i + 1 < n
            and "-" in lines[i + 1]
            and _TABLE_SEP_RE.match(lines[i + 1])
        ):
            tbl_lines = [line]
            j = i + 2  # saute la ligne de separation
            while j < n and lines[j].lstrip().startswith("|"):
                tbl_lines.append(lines[j])
                j += 1
            rows = []
            for tl in tbl_lines:
                cells = [c.strip() for c in tl.strip().strip("|").split("|")]
                rows.append(cells)
            body.append(table_xml(rows))
            i = j
            continue

        # Puce
        m = _BULLET_RE.match(line)
        if m:
            indent = len(m.group(1))
            runs = [("•  ", {})] + parse_inline(m.group(2))
            body.append(para_xml(runs, ind=360 + indent * 180))
            i += 1
            continue

        # Liste numerotee
        m = _NUMBER_RE.match(line)
        if m:
            indent = len(m.group(1))
            runs = [(m.group(2) + ".  ", {})] + parse_inline(m.group(3))
            body.append(para_xml(runs, ind=360 + indent * 180))
            i += 1
            continue

        # Citation
        m = _QUOTE_RE.match(line)
        if m:
            runs = [(t, dict(s, italic=True)) for t, s in parse_inline(m.group(1))]
            body.append(para_xml(runs, ind=360))
            i += 1
            continue

        # Paragraphe normal
        body.append(para_xml(parse_inline(line)))
        i += 1

    return body


# --------------------------------------------------------------------------- #
# Parties statiques du paquet OOXML                                            #
# --------------------------------------------------------------------------- #
CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    "</Types>"
)

RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    "</Relationships>"
)

DOC_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    "</Relationships>"
)


def _heading_style(idx, size, color, outline):
    return (
        '<w:style w:type="paragraph" w:styleId="Heading%d"><w:name w:val="heading %d"/>'
        '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>'
        '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="%d"/></w:pPr>'
        '<w:rPr><w:b/><w:sz w:val="%d"/><w:color w:val="%s"/></w:rPr></w:style>'
        % (idx, idx, outline, size, color)
    )


STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    "<w:docDefaults><w:rPrDefault><w:rPr>"
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>'
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>'
    '<w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:style>'
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>'
    '<w:pPr><w:spacing w:before="480" w:after="120"/></w:pPr>'
    '<w:rPr><w:b/><w:sz w:val="64"/><w:color w:val="%s"/></w:rPr></w:style>'
    '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/>'
    '<w:pPr><w:spacing w:after="240"/></w:pPr>'
    '<w:rPr><w:sz w:val="32"/><w:color w:val="%s"/></w:rPr></w:style>'
    "%s%s%s%s"
    '<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/>'
    '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>'
    '<w:shd w:val="clear" w:color="auto" w:fill="%s"/></w:pPr>'
    '<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr></w:style>'
    '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/>'
    "<w:tblPr><w:tblBorders>"
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="%s"/>'
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="%s"/>'
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="%s"/>'
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="%s"/>'
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="%s"/>'
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="%s"/>'
    "</w:tblBorders></w:tblPr></w:style>"
    "</w:styles>"
) % (
    PRIMARY,
    PRIMARY_LIGHT,
    _heading_style(1, 36, PRIMARY, 0),
    _heading_style(2, 30, PRIMARY_LIGHT, 1),
    _heading_style(3, 26, ACCENT, 2),
    _heading_style(4, 23, ACCENT, 3),
    CODE_FILL,
    TABLE_BORDER,
    TABLE_BORDER,
    TABLE_BORDER,
    TABLE_BORDER,
    TABLE_BORDER,
    TABLE_BORDER,
)

SECTPR = (
    "<w:sectPr>"
    '<w:pgSz w:w="11906" w:h="16838"/>'
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" '
    'w:header="709" w:footer="709" w:gutter="0"/>'
    "</w:sectPr>"
)


def title_page_xml(title, subtitle):
    parts = [
        '<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>%s</w:p>'
        % runs_xml(parse_inline(title))
    ]
    if subtitle:
        parts.append(
            '<w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr>%s</w:p>'
            % runs_xml(parse_inline(subtitle))
        )
    parts.append(pagebreak_xml())
    return "".join(parts)


def build_document_xml(md_files, title=None, subtitle=None):
    blocks = []
    if title:
        blocks.append(title_page_xml(title, subtitle))
    for idx, path in enumerate(md_files):
        if idx > 0:
            blocks.append(pagebreak_xml())
        with open(path, "r", encoding="utf-8") as fh:
            blocks.extend(md_to_blocks(fh.read()))
    body = "".join(blocks)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>%s%s</w:body></w:document>" % (body, SECTPR)
    )


def write_docx(out_path, document_xml):
    out_dir = os.path.dirname(os.path.abspath(out_path))
    if out_dir and not os.path.isdir(out_dir):
        os.makedirs(out_dir, exist_ok=True)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", document_xml)
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
        z.writestr("word/styles.xml", STYLES)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Convertit un ou plusieurs fichiers Markdown en un .docx (sans dependance)."
    )
    parser.add_argument("inputs", nargs="+", help="Fichier(s) Markdown source.")
    parser.add_argument("--out", help="Chemin du .docx de sortie.")
    parser.add_argument("--title", help="Titre de la page de garde (optionnel).")
    parser.add_argument(
        "--subtitle", help="Sous-titre de la page de garde (optionnel)."
    )
    args = parser.parse_args(argv)

    for p in args.inputs:
        if not os.path.isfile(p):
            print("ERREUR : fichier introuvable : %s" % p, file=sys.stderr)
            return 2

    out = args.out
    if not out:
        base, _ = os.path.splitext(args.inputs[0])
        out = base + ".docx"

    document_xml = build_document_xml(
        args.inputs, title=args.title, subtitle=args.subtitle
    )
    write_docx(out, document_xml)
    print(
        "OK -> %s (%d fichier(s) source, %d octets)"
        % (out, len(args.inputs), os.path.getsize(out))
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
