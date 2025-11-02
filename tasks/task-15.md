### Task 15: Email Integration
- [ ] Set up email forwarding infrastructure (custom domain/email provider)
- [ ] Create email parsing service (extract text and attachments)
- [ ] Implement webhook endpoint for incoming emails
- [ ] Parse email content for event details using Claude
- [ ] Generate and send .ics file as email reply
- [ ] Add email whitelist/authentication for security
- [ ] Create landing page explaining email integration
- [ ] Test with various email clients (Gmail, Outlook, Apple Mail)
- Location: `src/app/api/email/route.ts`, `src/services/emailParser.ts`, email server config

**Priority**: High Impact, High Effort (20-30 hours)
**Benefits**: Integrates with existing workflow (forwarding emails)
**Trade-offs**: Requires backend infrastructure, email server setup
