export function addPageHeaderButton(text: string) {
    var a = document.createElement('a');
    a.textContent = text;
    a.className = 'btn btn-lg btn-default';
    document.querySelector('.page-header-btns').appendChild(a);
    return a;
}
