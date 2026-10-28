# FirstStaff Ticketing AI — revised workflow prototype

A responsive Node.js prototype for staff flight requests, approval-document upload, Protocol coordination, vendor flight quotations, passenger selection, Line Executive cost approval, vendor ticket issuance, Protocol ticket handover, and Procurement-led store cost finalization.

## Run locally
- Install Node.js 18 or newer.
- In this folder run `npm start`.
- Open `http://localhost:3000`.

## Demo logins
| Role | Email | Password |
|---|---|---|
| Staff requester | staff@firststaff.local | Staff@123 |
| Line Executive | executive@firststaff.local | Exec@123 |
| Vendor | vendor@firststaff.local | Vendor@123 |
| Ticketing (legacy/demo) | ticketing@firststaff.local | Ticket@123 |
| Protocol Unit | protocol@firststaff.local | Protocol@123 |
| Store Officer | store@firststaff.local | Store@123 |
| Procurement Team | procurement@firststaff.local | Procure@123 |
| System Administrator | admin@firststaff.local | Admin@123 |

## Revised workflow
1. Staff requester submits itinerary details and uploads an approval document (maximum 6 MB).
2. Protocol reviews the request and sends it to vendors.
3. Vendors submit one or more flight options and fares.
4. Protocol reviews received options and notifies the passenger to select.
5. Passenger selects a preferred flight.
6. Line Executive approves or rejects the selected fare.
7. After cost approval, the vendor is notified to issue the ticket; Protocol receives a notification.
8. Vendor records the ticket number and may upload the issued ticket document.
9. Protocol confirms ticket receipt and marks the ticket as shared with the passenger.
10. The approved fare is recorded as a pending store commitment; no debit is posted yet.
11. Procurement enters its reference and finalizes the process. Only then is the debit recorded in the prototype ledger.

## Important limitations
This is a workflow prototype, not a production-ready corporate travel or finance system. Data is stored in a local JSON file; uploaded documents are stored as base64 data in that file. The prototype does not connect to airline inventory, company identity systems, procurement software, or a live store/finance ledger. Email delivery requires valid SMTP settings and real mailbox/vendor addresses to be configured by an authorised administrator; without those settings, notifications remain in-app only. Before real use, add secure password hashing and session expiry, role-based record access, persistent database/object storage, malware scanning and file validation, audit logging, backups, authorized finance integrations, and deployment secrets. Never use the demo passwords or sample accounts for real confidential staff or passenger data.


## New workflow enhancements (this revision)

- International travel defaults the arrival airport to London Heathrow (LHR) when the requester selects International, and suggests common international airports. Requesters can still edit the arrival airport.
- Requester selects a cost centre/store pair. **The current list is illustrative** and must be replaced with the organisation's approved store/cost-centre register in `app.js` before production.
- Protocol selects specific active vendors rather than broadcasting to every vendor. Requests are assigned to the selected vendor IDs, and vendor accounts can only view/quote on requests assigned to them.
- Vendor quotes include layovers, transit visa checks/details, destination visa requirements, health certificate/vaccination requirements, journey duration, baggage, fare conditions, and travel advisory notes. Vendors should verify requirements against official sources; the fields are not legal/immigration advice.
- Each vendor dispatch starts a 30-minute response countdown in the request detail view.
- Email alerts are sent when SMTP is configured. In-app notifications continue to work without SMTP.

### Configure email notifications

Set these environment variables in the hosting provider's service settings (do not commit credentials):

- `SMTP_HOST` — your organisation's approved SMTP host
- `SMTP_PORT` — commonly `587` (or your provider's specified port)
- `SMTP_SECURE` — `false` for STARTTLS on 587, `true` for implicit TLS on 465
- `SMTP_USER` — SMTP account username
- `SMTP_PASS` — SMTP password or app-specific password
- `MAIL_FROM` — approved sender address (optional; defaults to `SMTP_USER`)
- `PROTOCOL_QUEUE_EMAIL` — real mailbox for the Protocol queue alerts (recommended)
- `EXECUTIVE_QUEUE_EMAIL` — optional real mailbox for Line Executive queue alerts

The service must be redeployed/restarted after setting these values. If the variables are missing, email is not sent; the app still records in-app notifications. Use an organisation-approved mailbox and test with non-sensitive data before production.

### Demo vendor accounts

- Skyline Travels: `vendor@firststaff.local` / `Vendor@123`
- AeroConnect: `vendor2@firststaff.local` / `Vendor2@123`
- FirstWing Travel Services: `vendor3@firststaff.local` / `Vendor3@123`

Replace demo vendors, emails and the cost-centre/store list with approved organisation data before deployment. The 30-minute countdown is a UI target/reminder; it does not automatically penalise vendors or guarantee email delivery.
