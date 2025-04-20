# Instagram Setup Guide

This bot can download Instagram content including posts, stories, and reels. For private content, you'll need to use browser cookies for authentication.

## Cookie-Based Authentication

The bot uses browser cookies for Instagram authentication. This method is reliable and works with all types of accounts.

## Using Browser Cookies

Follow these steps to set up Instagram authentication:

1. **Install a cookie exporter extension** in your browser:
   - Chrome/Edge: "EditThisCookie" or "Cookie-Editor"
   - Firefox: "Cookie Quick Manager" or "Cookie-Editor"

2. **Log in to Instagram** in your browser

3. **Export cookies** from the Instagram website:
   - Visit instagram.com while logged in
   - Click the cookie extension icon while on the Instagram website
   - Select "Export" or "Export as file" option
   - Save the cookies as a text file

4. **Send the cookie file** to the WhatsApp bot:
   - Just send the file as an attachment in WhatsApp
   - The bot will automatically detect and import it

The bot will confirm successful authentication with: ✅ Instagram cookies imported successfully!

## Downloading Content

Once authenticated with cookies, you can download Instagram content with:

```
!ig [instagram-url]
```

For example: `!ig https://www.instagram.com/p/ABC123/`

## Important Notes

- **Security**: Instagram cookies contain sensitive authentication data. Do not share them with anyone.
  
- **Session Expiry**: Instagram sessions may expire after some time. If downloads start failing, export fresh cookies from your browser and send them again.
  
- **Private Content**: To access private content, you must be following the account on Instagram using the same account whose cookies you're using.

## Troubleshooting

If you encounter issues:

1. **Check cookie file**: Make sure the cookie file is exported correctly from Instagram.com
   
2. **Try fresh cookies**: Log out and log back in to Instagram in your browser, then export fresh cookies
   
3. **Use a different browser**: Try exporting cookies from a different browser like Chrome or Firefox
   
4. **Check content accessibility**: Verify you can actually view the content when logged in to Instagram in your browser
   
5. **Account permissions**: Make sure you follow the account if the content is from a private profile 