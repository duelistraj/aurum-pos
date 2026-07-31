from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

from app.core.config import Settings

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SITE_DIRECTORY = REPOSITORY_ROOT / "site"
PUBLIC_PAGES = tuple(sorted(SITE_DIRECTORY.glob("*.html")))


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.references: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attributes: list[tuple[str, str | None]],
    ) -> None:
        values = dict(attributes)
        if identifier := values.get("id"):
            self.ids.add(identifier)
        reference = values.get("href") if tag == "a" else values.get("src")
        if reference:
            self.references.append(reference)


def parse_page(path: Path) -> PageParser:
    parser = PageParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def test_every_public_page_uses_the_shared_brand_and_visual_system() -> None:
    expected_logo = REPOSITORY_ROOT / "frontend" / "src" / "assets" / "aurum-logo.svg"
    public_logo = SITE_DIRECTORY / "public-assets" / "aurum-logo.svg"
    assert public_logo.read_bytes() == expected_logo.read_bytes()

    for page in PUBLIC_PAGES:
        source = page.read_text(encoding="utf-8")
        assert 'href="/public-assets/site.css"' in source
        assert 'src="/public-assets/aurum-logo.svg"' in source
        assert 'src="/public-assets/site.js"' in source


def test_homepage_navigation_targets_real_sections_and_pages() -> None:
    homepage = parse_page(SITE_DIRECTORY / "index.html")
    for section in {"features", "retailers", "pricing", "resources", "changelog"}:
        assert section in homepage.ids

    for page in PUBLIC_PAGES:
        parser = parse_page(page)
        for reference in parser.references:
            parsed = urlsplit(reference)
            if parsed.scheme or reference.startswith(("mailto:", "#")):
                continue
            if parsed.path in {"", "/"}:
                if parsed.fragment:
                    assert parsed.fragment in homepage.ids
                continue
            target = SITE_DIRECTORY / parsed.path.lstrip("/")
            assert target.exists(), f"{page.name} links to missing {reference}"
            if parsed.fragment and target.suffix == ".html":
                assert parsed.fragment in parse_page(target).ids


def test_public_ctas_and_plan_limits_match_the_application_contract() -> None:
    homepage = (SITE_DIRECTORY / "index.html").read_text(encoding="utf-8")
    terms = (SITE_DIRECTORY / "terms.html").read_text(encoding="utf-8")
    environment = (REPOSITORY_ROOT / ".env.example").read_text(encoding="utf-8")
    readme = (REPOSITORY_ROOT / "README.md").read_text(encoding="utf-8")

    assert 'href="https://app.aurumpos.net/login"' in homepage
    assert 'href="https://app.aurumpos.net/login?mode=register"' in homepage
    assert "500 active inventory items" in homepage
    assert "500 active inventory records" in terms
    assert "FREE_ACTIVE_ITEM_LIMIT=500" in environment
    assert "500 active inventory records" in readme
    assert Settings.model_fields["free_active_item_limit"].default == 500


def test_dashboard_preview_has_accessible_load_motion() -> None:
    homepage = (SITE_DIRECTORY / "index.html").read_text(encoding="utf-8")
    stylesheet = (SITE_DIRECTORY / "public-assets" / "site.css").read_text(
        encoding="utf-8"
    )
    sidebar_labels = (
        "Dashboard",
        "Sales",
        "Inventory",
        "Metal Rates",
        "Transactions",
        "Analytics",
    )
    sidebar_positions = [
        homepage.index(f"</svg>{label}</span>") for label in sidebar_labels
    ]

    assert 'aria-label="Illustrative Aurum POS dashboard preview"' in homepage
    assert sidebar_positions == sorted(sidebar_positions)
    assert 'Aurum POS <sup class="preview-sidebar__plan">Pro</sup>' in homepage
    assert '<span class="is-active"><svg' in homepage
    assert "<strong>Analytics</strong>" in homepage
    assert "Aurum Jewellers" in homepage
    assert "Meera Kapoor" in homepage
    assert "preview-animal-avatar" in homepage
    assert "Silver jewellery 24%" in homepage
    assert "Platinum jewellery 28%" in homepage
    assert "Other inventory" not in homepage
    assert 'mask="url(#preview-donut-reveal)"' in homepage
    assert "preview-donut__reveal" in homepage
    assert "preview-donut__segment--gold" in homepage
    assert "preview-donut__segment--silver" in homepage
    assert "preview-donut__segment--platinum" in homepage
    assert "pathLength=\"1\"" in homepage
    assert "animation: preview-shell-enter" in stylesheet
    assert "animation: preview-rise" in stylesheet
    assert "animation: preview-chart-draw" in stylesheet
    assert "animation: preview-donut-sweep 620ms linear 880ms both" in stylesheet
    assert "@keyframes preview-avatar-bob" in stylesheet
    assert "@keyframes preview-avatar-blink" in stylesheet
    assert "@keyframes preview-donut-sweep" in stylesheet
    assert "@media (prefers-reduced-motion: reduce)" in stylesheet
    assert "animation: none !important" in stylesheet
    assert "stroke-dashoffset: 0" in stylesheet
