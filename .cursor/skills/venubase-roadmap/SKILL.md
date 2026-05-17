---
name: venubase-roadmap
description: >-
  Search and update Venubase roadmap cards to keep them in sync with development work.
  Use when working on a feature or bug to find related roadmap cards and update their
  status and content. Works with roadmap files in venubase-web/docs/roadmap/.
---

# Venubase Roadmap Sync

Keep roadmap cards up-to-date as you work on features and bugs.

## Roadmap Location

- **Repository**: `mattcrest/venubase-web`
- **Directory**: `/docs/roadmap/`
- **Files**: Individual markdown cards (one per feature/item) + `kanban.json`
- **Access**: Can be referenced with `-c /path/to/venubase-web` context flag for agents

## Common Tasks

### Find a roadmap card

Search for cards by title, status, or category:

```bash
grep -r "your search term" /path/to/venubase-web/docs/roadmap/
grep -r "status: Active" /path/to/venubase-web/docs/roadmap/
grep -r "category: Admin" /path/to/venubase-web/docs/roadmap/
```

Or use jq to search the kanban.json config:

```bash
jq '.cards[] | select(.title | contains("search term"))' kanban.json
```

### View a card

Each card is a markdown file with YAML frontmatter. Read it directly:

```bash
cat /path/to/venubase-web/docs/roadmap/{card-id}.md
```

Front matter includes:
- `title`: Card title
- `status`: One of Active, Backlog, Shipped, On Hold
- `category`: Feature grouping
- `roadmap_order`: Display order
- `plan_anchor`: Link anchor

Content below frontmatter is the card description.

### Update a card

Edit the markdown file to change:
- **Title**: Update the `title:` field in frontmatter
- **Status**: Update `status:` field (Active, Backlog, Shipped, On Hold)
- **Category**: Update `category:` field
- **Content**: Update the description section below frontmatter

Example:

```bash
cat > /path/to/venubase-web/docs/roadmap/release-checkout-refunds.md << 'EOF'
---
title: Refund processing for checkout
status: Active
category: Checkout
roadmap_order: 25
plan_anchor: Refund processing for checkout
shipped_at: null
---

# Refund processing for checkout

## Summary

Allow venue staff to process refunds for completed transactions through the admin dashboard.

## Implementation

- Add refund UI to transaction details
- Integrate with Stripe refund API
- Send refund confirmation emails
EOF
```

### Batch operations

Find all Active cards in a category:

```bash
grep -l "status: Active" /path/to/venubase-web/docs/roadmap/release-*.md | xargs -I {} grep -l "category: Admin" {}
```

Mark multiple cards as Shipped:

```bash
# Find cards then sed to update status
sed -i.bak 's/status: Active/status: Shipped/' /path/to/venubase-web/docs/roadmap/release-admin-*.md
```

## Workflow

### As you work on a feature:

1. **Find the card**: Search by feature name or category
2. **Read the card**: Understand current status and description
3. **Update status**: Change to "Active" when you start, "Shipped" when merging PR
4. **Update content**: Add implementation details, progress notes, blockers
5. **Commit**: `git add docs/roadmap/{card-id}.md && git commit -m "Update roadmap: {card title}"`

### Example flow:

```bash
# 1. Search for card
grep -r "operating hours" /path/to/venubase-web/docs/roadmap/

# 2. Read the card
cat /path/to/venubase-web/docs/roadmap/release-admin-operating-hours-crud.md

# 3. Update status and content
# Edit the file to mark as Active, add implementation progress

# 4. Commit the change
git add /path/to/venubase-web/docs/roadmap/release-admin-operating-hours-crud.md
git commit -m "Update roadmap: Operating hours CRUD now in development"
git push
```

## Programmatic Updates (Claude Functions)

The skill includes functions for Claude to automatically update cards:

### Update card status

```javascript
updateRoadmapCard({
  cardId: 'release-admin-operating-hours-crud',
  updates: {
    status: 'Active',
    progress: '40% complete - CRUD endpoints done, UI in progress'
  }
})
```

### Add progress note

```javascript
addProgressNote({
  cardId: 'release-admin-operating-hours-crud',
  note: 'Completed API endpoints, working on admin panel UI. 
         PR #234 in review for approval.'
})
```

### Mark as shipped

```javascript
markAsShipped({
  cardId: 'release-admin-operating-hours-crud',
  date: '2026-05-09',
  prUrl: 'https://github.com/mattcrest/venubase-web/pull/234'
})
```

### Commit updates

```javascript
commitRoadmapUpdates({
  cardIds: ['release-admin-operating-hours-crud'],
  message: 'Update roadmap: operating hours CRUD marked as shipped'
})
```

## For Cloud Agents

Agents can search, update, and keep users informed of progress:

```
Work on admin operating hours feature:
1. Find the roadmap card
2. Mark status as "Active" and add progress note
3. As you implement features, add progress updates
4. When done, mark as "Shipped" with PR link
5. Commit all updates to venubase-web
6. Notify user of completion
```

Pass `-c /path/to/venubase-web` to give agents direct access:

```bash
# Claude Code example - agent will auto-update roadmap as it works
claude ask -c /path/to/venubase-web "Implement the admin operating hours feature. 
Update the roadmap card status as you progress and mark it shipped when you open the PR."
```

### Progress updates during work

Claude automatically keeps the card updated with:
- **Started**: Changes status to "Active", adds start timestamp
- **Mid-progress**: Adds notes like "60% done - completed X, working on Y"
- **Blocked**: Updates status to indicate blocker
- **Shipped**: Marks complete with PR link and shipped date

Example automated flow:

```
User: "Implement admin operating hours"
1. Claude finds 'release-admin-operating-hours-crud' card
2. Marks status → Active, adds "Started implementation"
3. After API work: Updates card → "60% - API endpoints complete"
4. After UI work: Updates card → "90% - UI done, testing"
5. Creates PR: Marks → Shipped with PR #123 link
6. User sees: Real-time roadmap sync with actual work
```

## File Format Reference

Roadmap cards use markdown with YAML frontmatter:

```markdown
---
title: Feature name
status: Active|Backlog|Shipped|On Hold
category: Admin|Checkout|Events|etc
roadmap_order: 10
plan_anchor: Feature name
shipped_at: YYYY-MM-DD or null
---

# Feature name

## Summary
Brief one-liner

## Implementation
- Bullet point breakdown
- Of what needs to be done

## Related Issues
- Link to GitHub issues if applicable
```

Card filename: `{slug}.md` where slug matches the plan_anchor in kebab-case.

## Progress Notifications

The skill keeps you aware of changes through progress summaries:

### At each milestone:

```
✓ Roadmap Updated
  Card: Admin Operating Hours CRUD
  Status: Active → In Progress (60%)
  Changes:
    - API endpoints completed
    - UI scaffolding started
  Next: Finish venue hours editor component
  PR: (pending)
```

### On completion:

```
✓ Shipped: Admin Operating Hours CRUD
  PR: mattcrest/venubase-web#234
  Status: Active → Shipped
  Shipped Date: 2026-05-09
  Implementation took: 3 days across 2 PRs
```

### When blocked:

```
⚠ Roadmap Alert
  Card: Admin Operating Hours CRUD
  Status: Active
  Blocker: Waiting for design approval on time picker UI
  Updated: 2026-05-08
  Unblock by: Review design PR #123
```

## Examples

### Start a feature (Claude will do this):

```
User: "Start work on admin operating hours CRUD"

Claude:
  1. Finds card: release-admin-operating-hours-crud
  2. Updates: status → Active, adds timestamp
  3. Commits: "roadmap: Start admin operating hours CRUD"
  4. Notifies: "✓ Roadmap Updated: Started admin operating hours"
```

### Mid-work progress update:

```
User: "Update progress on the operating hours feature"

Claude:
  1. Reads current card state
  2. Updates with: "75% complete - API done, UI in progress"
  3. Commits: "roadmap: Progress update on operating hours"
  4. Shows: Current status and next steps
```

### Ship a feature:

```
User: "The operating hours feature is merged in PR #234"

Claude:
  1. Finds card
  2. Updates: status → Shipped, adds PR link and date
  3. Commits: "roadmap: Ship admin operating hours (PR #234)"
  4. Notifies: "✓ Shipped: Admin Operating Hours. PR merged and deployed."
```
