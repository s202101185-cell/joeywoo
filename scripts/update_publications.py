#!/usr/bin/env python3
"""
scripts/update_publications.py
Fetch recent works from Crossref and arXiv for the author and update publications.html + sitemap.xml.
This script is intended to run inside GitHub Actions (GITHUB_TOKEN available) or locally.
"""
import requests
import xml.etree.ElementTree as ET
from html import escape

SITE_ROOT = 'https://s202101185-cell.github.io'
AUTHOR = 'Joey Woo'
ORCID = '0009-0008-8888-9495'


def fetch_crossref(q=AUTHOR, rows=10):
    url = f'https://api.crossref.org/works?query.author={requests.utils.quote(q)}&rows={rows}'
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()
    items = data.get('message', {}).get('items', [])
    results = []
    for it in items:
        title = it.get('title', [''])[0]
        doi = it.get('DOI')
        url = it.get('URL')
        authors = []
        for a in it.get('author', []):
            name = ' '.join(filter(None, [a.get('given',''), a.get('family','')]))
            authors.append(name)
        results.append({'title': title, 'doi': doi, 'url': url, 'authors': authors})
    return results


def fetch_arxiv(q=AUTHOR, max_results=10):
    # use arXiv API (ATOM)
    qparam = f'au:"{q}"'
    url = f'http://export.arxiv.org/api/query?search_query={requests.utils.quote(qparam)}&max_results={max_results}'
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    root = ET.fromstring(r.text)
    ns = {'atom':'http://www.w3.org/2005/Atom'}
    entries = []
    for entry in root.findall('atom:entry', ns):
        title = (entry.find('atom:title', ns).text or '').strip()
        id_url = entry.find('atom:id', ns).text
        entries.append({'title': title, 'url': id_url})
    return entries


def build_publications_html(crossref, arxiv):
    parts = []
    parts.append('<!DOCTYPE html>')
    parts.append('<html lang="en">')
    parts.append('<head>')
    parts.append('  <meta charset="UTF-8">')
    parts.append('  <meta name="viewport" content="width=device-width, initial-scale=1.0">')
    parts.append('  <meta name="description" content="Publications and preprints by Joey Woo. Automatically updated." />')
    parts.append('  <title>Publications · Joey Woo</title>')
    parts.append('  <link rel="stylesheet" href="style.css">')
    parts.append('</head>')
    parts.append('<body>')
    parts.append('  <nav>')
    parts.append('    <a href="index.html">Home</a>')
    parts.append('    <a href="research.html">Research</a>')
    parts.append('    <a href="publications.html">Publications</a>')
    parts.append('    <a href="about.html">About</a>')
    parts.append('    <a href="contact.html">Contact</a>')
    parts.append('  </nav>')
    parts.append('  <header class="hero"><div class="hero-content fade-in"><div class="hero-text"><h1>Publications</h1><p>Automatically updated list (arXiv & DOI links).</p></div></div></header>')
    parts.append('  <main class="container fade-in">')
    parts.append('    <section>')
    parts.append('      <h2>arXiv (recent)</h2>')
    for e in arxiv[:10]:
        parts.append('      <div class="card">')
        parts.append(f'        <h3>{escape(e["title"])}</h3>')
        parts.append(f'        <p><a href="{escape(e["url"])}" target="_blank" rel="noopener">View on arXiv</a></p>')
        parts.append('      </div>')
    parts.append('    </section>')
    parts.append('    <section>')
    parts.append('      <h2>Crossref / DOI (recent)</h2>')
    for c in crossref[:10]:
        parts.append('      <div class="card">')
        parts.append(f'        <h3>{escape(c.get("title",""))}</h3>')
        if c.get('doi'):
            doi_url = 'https://doi.org/' + c['doi']
            parts.append(f'        <p><a href="{escape(doi_url)}" target="_blank" rel="noopener">View DOI</a>')
            if c.get('url'):
                parts.append(f' &middot; <a href="{escape(c.get("url"))}" target="_blank" rel="noopener">Publisher page</a>')
            parts.append('</p>')
        elif c.get('url'):
            parts.append(f'        <p><a href="{escape(c.get("url"))}" target="_blank" rel="noopener">Publisher page</a></p>')
        parts.append('      </div>')
    parts.append('    </section>')
    parts.append('  </main>')
    parts.append('  <footer><p>© 2026 Joey Woo</p></footer>')
    parts.append('  <script src="assets/js/ai-enhancer.js" defer></script>')
    parts.append('</body></html>')
    return '\n'.join(parts)


def build_sitemap(urls):
    parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        parts.append(f'  <url><loc>{u}</loc></url>')
    parts.append('</urlset>')
    return '\n'.join(parts)


def main():
    try:
        cx = fetch_crossref()
    except Exception as e:
        print('Crossref fetch failed:', e)
        cx = []
    try:
        ax = fetch_arxiv()
    except Exception as e:
        print('arXiv fetch failed:', e)
        ax = []
    html = build_publications_html(cx, ax)
    with open('publications.html', 'w', encoding='utf-8') as f:
        f.write(html)
    urls = [SITE_ROOT + '/', SITE_ROOT + '/index.html', SITE_ROOT + '/research.html', SITE_ROOT + '/publications.html', SITE_ROOT + '/about.html', SITE_ROOT + '/contact.html']
    sitemap = build_sitemap(urls)
    with open('sitemap.xml', 'w', encoding='utf-8') as f:
        f.write(sitemap)
    print('Updated publications.html and sitemap.xml')

if __name__ == '__main__':
    main()
