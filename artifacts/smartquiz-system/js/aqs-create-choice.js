(function () {
    'use strict';

    function initCreateChoice() {
        var trigger = document.querySelector('[data-create-choice-trigger]');
        if (!trigger || document.getElementById('aqs-create-choice-backdrop')) return;

        var backdrop = document.createElement('div');
        backdrop.id = 'aqs-create-choice-backdrop';
        backdrop.className = 'aqs-create-choice-backdrop';
        backdrop.setAttribute('role', 'presentation');
        backdrop.innerHTML =
            '<section class="aqs-create-choice" role="dialog" aria-modal="true" aria-labelledby="aqs-create-choice-title">' +
                '<div class="aqs-create-choice-header">' +
                    '<h2 id="aqs-create-choice-title">Do you want to create quiz for yourself or host a quiz for others?</h2>' +
                    '<button type="button" class="aqs-create-choice-close" data-testid="button-close-create-quiz-choice" aria-label="Close quiz creation choices">×</button>' +
                '</div>' +
                '<div class="aqs-create-choice-options">' +
                    '<a class="aqs-create-choice-option" href="self-quiz.html" data-testid="link-self-quiz-choice">' +
                        '<strong>Self Quiz</strong>' +
                        '<span>Self Quiz is generated for you and can be taken for yourself.</span>' +
                    '</a>' +
                    '<a class="aqs-create-choice-option" href="create-quiz.html" data-testid="link-host-quiz-choice">' +
                        '<strong>Host Quiz</strong>' +
                        '<span>Host Quiz generates a quiz you can share with others through a shareable link.</span>' +
                    '</a>' +
                '</div>' +
            '</section>';
        document.body.appendChild(backdrop);

        var closeButton = backdrop.querySelector('[data-testid="button-close-create-quiz-choice"]');
        var previousFocus = null;

        function close() {
            backdrop.classList.remove('is-open');
            document.body.style.overflow = '';
            if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
        }

        function open(event) {
            event.preventDefault();
            previousFocus = document.activeElement;
            backdrop.classList.add('is-open');
            document.body.style.overflow = 'hidden';
            closeButton.focus();
        }

        trigger.addEventListener('click', open);
        closeButton.addEventListener('click', close);
        backdrop.addEventListener('click', function (event) {
            if (event.target === backdrop) close();
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && backdrop.classList.contains('is-open')) close();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCreateChoice);
    } else {
        initCreateChoice();
    }
}());