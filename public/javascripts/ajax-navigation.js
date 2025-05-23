document.addEventListener('DOMContentLoaded', () => {
  function setupAjaxNavigation() {
    const mainContent = document.querySelector('main');

    document.addEventListener('submit', (event) => {
      const form = event.target;

      // Skip forms that shouldn't use AJAX
      if (form.getAttribute('data-no-ajax') || form.getAttribute('target') === '_blank') {
        return;
      }

      // Don't intercept file upload forms
      if (form.enctype === 'multipart/form-data') {
        return;
      }

      event.preventDefault();

      // Show loading indicator
      mainContent.style.opacity = '0.7';

      const formData = new FormData(form);
      const method = form.method.toUpperCase() || 'GET';
      const url = form.action || window.location.href;

      // For GET requests, convert FormData to query string
      let fetchOptions = {};
      if (method === 'GET') {
        const queryString = new URLSearchParams(formData).toString();
        const finalUrl = url + (url.includes('?') ? '&' : '?') + queryString;
        fetchOptions = {
          method: 'GET',
          headers: {'X-Requested-With': 'XMLHttpRequest'}
        };
        fetch(finalUrl, fetchOptions)
            .then(handleResponse)
            .catch(handleError);
      } else {
        // For POST/PUT/etc requests
        fetchOptions = {
          method: method,
          body: formData,
          headers: {'X-Requested-With': 'XMLHttpRequest'}
        };
        fetch(url, fetchOptions)
            .then(handleResponse)
            .catch(handleError);
      }

      function handleResponse(response) {
        if (response.redirected) {
          // If the server redirected us, follow the redirect without a page reload
          fetch(response.url, { headers: {'X-Requested-With': 'XMLHttpRequest'} })
              .then(res => res.text())
              .then(updatePage)
              .catch(handleError);

          // Update URL to the redirected location
          window.history.pushState({}, '', response.url);
          return;
        }

        return response.text().then(updatePage);
      }

      function updatePage(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newContent = doc.querySelector('main');

        if (newContent) {
          mainContent.innerHTML = newContent.innerHTML;
          document.title = doc.title;

          // Re-run scripts
          const scripts = mainContent.querySelectorAll('script');
          scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr =>
                newScript.setAttribute(attr.name, attr.value)
            );
            newScript.textContent = oldScript.textContent;
            oldScript.parentNode.replaceChild(newScript, oldScript);
          });

          // Update URL if it was a GET form
          if (method === 'GET') {
            const queryString = new URLSearchParams(formData).toString();
            const newUrl = url + (url.includes('?') ? '&' : '?') + queryString;
            window.history.pushState({}, '', newUrl);
          }
        }

        mainContent.style.opacity = '1';
      }

      function handleError(error) {
        console.error('Form submission error:', error);
        form.submit(); // Fall back to normal form submission
      }
    });

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a');

      // Ignore if not a link or external link or has specific attributes
      if (!link || link.getAttribute('target') === '_blank' ||
          link.getAttribute('data-no-ajax') ||
          !link.href.startsWith(window.location.origin)) {
        return;
      }

      // Don't intercept media player links
      if (link.href.includes('/player/') || link.classList.contains('play-button')) {
        return;
      }

      event.preventDefault();

      // Show loading indicator
      mainContent.style.opacity = '0.7';

      // Fetch the new page content
      fetch(link.href, {
        headers: {'X-Requested-With': 'XMLHttpRequest'}
      })
      .then(response => response.text())
      .then(html => {
        // Extract just the main content
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newContent = doc.querySelector('main').innerHTML;

        // Update the page
        mainContent.innerHTML = newContent;
        window.history.pushState({}, '', link.href);
        document.title = doc.title;
        mainContent.style.opacity = '1';

        // Re-run any scripts in the main content
        const scripts = mainContent.querySelectorAll('script');
        scripts.forEach(oldScript => {
          const newScript = document.createElement('script');
          Array.from(oldScript.attributes).forEach(attr =>
            newScript.setAttribute(attr.name, attr.value)
          );
          newScript.textContent = oldScript.textContent;
          oldScript.parentNode.replaceChild(newScript, oldScript);
        });
      })
      .catch(error => {
        console.error('Navigation error:', error);
        window.location.href = link.href; // Fall back to normal navigation on error
      });
    });

    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
      fetch(window.location.href, {
        headers: {'X-Requested-With': 'XMLHttpRequest'}
      })
      .then(response => response.text())
      .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        mainContent.innerHTML = doc.querySelector('main').innerHTML;
        document.title = doc.title;
      })
      .catch(() => window.location.reload());
    });
  }

  setupAjaxNavigation();
});