# Toss Open API contract verification required

Do not implement or deploy the Toss asset/portfolio integration until the official guide confirms all of the following:

1. Authentication request URL, method, headers, and body fields for the displayed `API Key` and `Secret Key`.
2. The exact account or asset endpoint used to identify the user's brokerage account.
3. Whether an account identifier is returned dynamically and which value is required in subsequent headers.
4. The exact holdings, price, exchange-rate, order, and fill endpoint paths and response schemas.
5. The backend outbound IP that must be registered in Toss `허용 IP 관리`.

The Toss settings screen supplied by the user exposes only:

- API Key
- Secret Key
- Allowed IP management

It does not issue user-facing `client_id`, `client_secret`, or `account_seq` values. Internal variable names must follow the Toss terminology after the guide is verified.
