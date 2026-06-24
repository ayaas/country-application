import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const PAGE_H = 1123 // .report-page height, px (A4 @ ~96dpi)
const PAGE_PAD_TOP = 64
const PAGE_PAD_BOTTOM = 64 + 24 // leaves room for the per-page footer

const HTML2CANVAS_OPTS = {
  scale: 2,
  useCORS: true,
  backgroundColor: '#ffffff',
  logging: false,
  // html2canvas measures negative letter-spacing incorrectly and renders
  // glyphs squashed together — strip it in the cloned DOM used for the
  // snapshot only; the live report/app styling is untouched.
  onclone: (doc) => {
    doc.querySelectorAll('*').forEach((el) => {
      el.style.letterSpacing = 'normal'
    })
  },
}

async function snapshot(el) {
  return html2canvas(el, HTML2CANVAS_OPTS)
}

function drawFullPage(pdf, canvas, pw, ph, isFirst) {
  if (!isFirst) pdf.addPage()
  const img = canvas.toDataURL('image/jpeg', 0.92)
  pdf.addImage(img, 'JPEG', 0, 0, pw, ph)
}

// Group `content`'s direct children into sections, each starting at an <h2>
// and running up to (not including) the next one — a heading and its content
// are never allowed to land on different pages.
function groupIntoSections(children) {
  const sections = []
  let current = []
  for (const child of children) {
    if (child.tagName === 'H2' && current.length > 0) {
      sections.push(current)
      current = []
    }
    current.push(child)
  }
  if (current.length > 0) sections.push(current)
  return sections
}

// Pack sections into groups that each fit within one page's usable height.
// A whole section moves to the next page rather than splitting a heading
// from its content; only a section taller than a full page is split
// internally (between its own children, never inside one).
function buildContentPageChunks(content, pageNumberStart) {
  const usableH = PAGE_H - PAGE_PAD_TOP - PAGE_PAD_BOTTOM
  const sections = groupIntoSections(Array.from(content.children))

  const groups = []
  let current = []
  let currentH = 0

  const flush = () => {
    if (current.length > 0) {
      groups.push(current)
      current = []
      currentH = 0
    }
  }

  for (const section of sections) {
    const sectionH = section.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0)

    if (sectionH <= usableH) {
      if (current.length > 0 && currentH + sectionH > usableH) flush()
      current.push(...section)
      currentH += sectionH
    } else {
      flush()
      for (const child of section) {
        const h = child.getBoundingClientRect().height
        if (current.length > 0 && currentH + h > usableH) flush()
        current.push(child)
        currentH += h
      }
    }
  }
  flush()

  return groups.map((group, i) => {
    const page = document.createElement('section')
    page.className = 'report-page report-page-fixed'
    group.forEach((child) => page.appendChild(child.cloneNode(true)))

    const foot = document.createElement('div')
    foot.className = 'report-foot'
    foot.innerHTML = `<span>Country · Site Research</span><span>Page ${pageNumberStart + i}</span>`
    page.appendChild(foot)

    return page
  })
}

// Capture the cover (always exactly one page) plus the content section,
// auto-paginated across as many pages as the data needs.
export async function exportReportPdf(reportRoot, filename = 'country-site-brief.pdf') {
  if (!reportRoot) return
  const cover = reportRoot.querySelector('[data-page="cover"]')
  const content = reportRoot.querySelector('[data-page="content"]')
  if (!cover && !content) return

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const pw = pdf.internal.pageSize.getWidth()
  const ph = pdf.internal.pageSize.getHeight()

  // Web fonts must be fully loaded before the canvas snapshot, or html2canvas
  // falls back to a system font mid-render and the metrics it then computes
  // for our (negative) letter-spacing values overlap glyphs.
  if (document.fonts?.ready) await document.fonts.ready

  let isFirst = true

  if (cover) {
    const canvas = await snapshot(cover)
    drawFullPage(pdf, canvas, pw, ph, isFirst)
    isFirst = false
  }

  if (content) {
    const chunkPages = buildContentPageChunks(content, isFirst ? 1 : 2)
    for (const page of chunkPages) {
      content.parentNode.appendChild(page) // same offscreen context as the report root
      const canvas = await snapshot(page)
      page.remove()
      drawFullPage(pdf, canvas, pw, ph, isFirst)
      isFirst = false
    }
  }

  pdf.save(filename)
}
