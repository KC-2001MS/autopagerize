// ==UserScript==
// @name           AutoPagerize
// @namespace      http://swdyh.yu.to/
// @description    loading next page and inserting into current page.
// @match          http://*/*
// @match          https://*/*
// @exclude        https://mail.google.com/*
// @exclude        http://b.hatena.ne.jp/*
// @exclude        http://www.facebook.com/plugins/like.php*
// @exclude        http://api.tweetmeme.com/button.js*
// @version        0.1.0
// @icon           http://autopagerize.net/img/icons/icon_032.png
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_addStyle
// @grant          GM_xmlhttpRequest
// @grant          GM_registerMenuCommand
// @grant          GM.getValue
// @grant          GM.setValue
// @grant          GM.addStyle
// @grant          GM.xmlHttpRequest
// @grant          GM.xmlhttpRequest
// @grant          GM.registerMenuCommand
// @connect        wedata.net
// @connect        raw.githubusercontent.com
// @connect        *
// @run-at         document-end
// @inject-into    content
// ==/UserScript==
//
// auther:  swdyh http://d.hatena.ne.jp/swdyh/
// version: 0.0.66 2012-08-31T18:23:34+09:00
//
// this script based on
// GoogleAutoPager(http://la.ma.la/blog/diary_200506231749.htm) and
// estseek autopager(http://la.ma.la/blog/diary_200601100209.htm).
// thanks to ma.la.
//
// Released under the GPL license
// http://www.gnu.org/copyleft/gpl.html
//

(function() {
'use strict'

var gm = createGMAdapter()

var HOME_URL = 'http://autopagerize.net/'
var VERSION = '0.1.0'
var DEBUG = false
var AUTO_START = true
var CACHE_EXPIRE = 24 * 60 * 60 * 1000
var BASE_REMAIN_HEIGHT = 400
var FORCE_TARGET_WINDOW = true
var XHR_TIMEOUT = 30 * 1000
// SITEINFO sources, tried in order. As of 2026 wedata.net answers only over
// HTTP, which Safari may block, so the snapshot bundled with AutoPagerize X
// (https://github.com/KC-2001MS/AutoPagerize-X) is used as the last resort.
var SITEINFO_CACHE_KEY = 'siteinfo'
var SITEINFO_SOURCES = [
    { url: 'https://wedata.net/databases/AutoPagerize/items_all.json',
      parse: parseWedataJSON },
    { url: 'http://wedata.net/databases/AutoPagerize/items_all.json',
      parse: parseWedataJSON },
    { url: 'https://raw.githubusercontent.com/KC-2001MS/AutoPagerize-X/main/' +
          'AutoPagerize%20X%20Extention/Resources/siteinfo.js',
      parse: parseBundledSiteinfo },
]
// retry interval when no source is available.
var SITEINFO_RETRY = 60 * 60 * 1000
var COLOR = {
    on: '#0f0',
    off: '#ccc',
    loading: '#0ff',
    terminated: '#00f',
    error: '#f0f'
}
var SITEINFO = [
    /* sample
    {
        url:          'http://(.*).google.+/(search).+',
        nextLink:     'id("navbar")//td[last()]/a',
        pageElement:  '//div[@id="res"]/div',
        exampleUrl:   'http://www.google.com/search?q=nsIObserver',
    },
    */
    /* template
    {
        url:          '',
        nextLink:     '',
        pageElement:  '',
        exampleUrl:   '',
    },
    */
]
var MICROFORMAT = {
    url:          '.*',
    nextLink:     '//a[@rel="next"] | //link[@rel="next"]',
    insertBefore: '//*[contains(@class, "autopagerize_insert_before")]',
    pageElement:  '//*[contains(@class, "autopagerize_page_element")]',
}

var AutoPager = function(info) {
    this.pageNum = 1
    this.info = info
    this.state = AUTO_START ? 'enable' : 'disable'
    var self = this
    var url = this.getNextURL(info.nextLink, document, location.href)

    if ( !url ) {
        debug("getNextURL returns null.", info.nextLink)
        return
    }
    if (info.insertBefore) {
        this.insertPoint = getFirstElementByXPath(info.insertBefore)
    }

    var lastPageElement
    if (!this.insertPoint) {
        lastPageElement = getElementsByXPath(info.pageElement).pop()
        if (lastPageElement) {
            this.insertPoint = lastPageElement.nextSibling ||
                lastPageElement.parentNode.appendChild(document.createTextNode(' '))
        }
    }

    if (!this.insertPoint) {
        debug("insertPoint not found.", lastPageElement, info.pageElement)
        return
    }

    this.requestURL = url
    this.loadedURLs = {}
    this.loadedURLs[location.href] = true
    var toggle = function() {self.stateToggle()}
    this.toggle = toggle
    gm.registerMenuCommand('AutoPagerize - on/off', toggle)
    this.scroll= function() { self.onScroll() }
    window.addEventListener("scroll", this.scroll, false)

    this.initIcon()
    this.initHelp()
    gm.addStyle('@media print{#autopagerize_icon, #autopagerize_help {display: none !important;}}')
    gm.addStyle('hr.autopagerize_page_separator {clear: both;}')
    this.icon.addEventListener("mouseover", function() {
        self.viewHelp()
    }, true)

    var scrollHeight = getScrollHeight()
    var bottom = getElementPosition(this.insertPoint).top ||
        this.getPageElementsBottom() ||
        (Math.round(scrollHeight * 0.8))
    this.remainHeight = scrollHeight - bottom + BASE_REMAIN_HEIGHT
    this.onScroll()

    var that = this
    document.addEventListener('AutoPagerizeToggleRequest', function() {
        that.toggle()
    }, false)
    document.addEventListener('AutoPagerizeUpdateIconRequest', function() {
        that.updateIcon()
    }, false)
    that.updateIcon()
}

AutoPager.prototype.getPageElementsBottom = function() {
    try {
        var elem = getElementsByXPath(this.info.pageElement).pop()
        return getElementBottom(elem)
    }
    catch(e) {
        return null
    }
}

AutoPager.prototype.initHelp = function() {
    var helpDiv = document.createElement('div')
    helpDiv.setAttribute('id', 'autopagerize_help')
    helpDiv.setAttribute('style', 'padding:5px;position:fixed;' +
                     'top:-200px;right:3px;font-size:10px;' +
                     'background:#fff;color:#000;border:1px solid #ccc;' +
                     'z-index:256;text-align:left;font-weight:normal;' +
                     'line-height:120%;font-family:verdana;')

    var toggleDiv = document.createElement('div')
    toggleDiv.setAttribute('style', 'margin:0 0 0 50px;')
    var a = document.createElement('a')
    a.setAttribute('class', 'autopagerize_link')
    a.textContent = 'on/off'
    a.href = 'javascript:void(0)'
    var self = this
    var toggle = function(e) {
        e.preventDefault()
        self.stateToggle()
        helpDiv.style.top = '-200px'
    }
    a.addEventListener('click', toggle, false)
    toggleDiv.appendChild(a)

    var s = '<div style="width:100px; float:left;">'
    for (var i in COLOR) {
        s += '<div style="float:left;width:1em;height:1em;' +
            'margin:0 3px;background-color:' + COLOR[i] + ';' +
            '"></div><div style="margin:0 3px">' + i + '</div>'
    }
    s += '</div>'
    var colorDiv = document.createElement('div')
    colorDiv.innerHTML = s
    helpDiv.appendChild(colorDiv)
    helpDiv.appendChild(toggleDiv)

    var versionDiv = document.createElement('div')
    versionDiv.setAttribute('style', 'clear:both;')
    versionDiv.innerHTML = '<a href="' + HOME_URL +
        '">AutoPagerize</a> ver ' + VERSION
    helpDiv.appendChild(versionDiv)
    document.body.appendChild(helpDiv)

    var proc = function(e) {
        var c_style = document.defaultView.getComputedStyle(helpDiv, '')
        var s = ['top', 'left', 'height', 'width'].map(function(i) {
            return parseInt(c_style.getPropertyValue(i)) })
        if (e.clientX < s[1] || e.clientX > (s[1] + s[3] + 11) ||
            e.clientY < s[0] || e.clientY > (s[0] + s[2] + 11)) {
                helpDiv.style.top = '-200px'
        }
    }
    helpDiv.addEventListener('mouseout', proc, false)
    this.helpLayer = helpDiv
    gm.addStyle('#autopagerize_help a { color: #0f0; text-decoration: underline;}')
}

AutoPager.prototype.viewHelp = function() {
    this.helpLayer.style.top = '3px'
}

AutoPager.prototype.onScroll = function() {
    var scrollHeight = Math.max(document.documentElement.scrollHeight,
                                document.body.scrollHeight)
    var remain = scrollHeight - window.innerHeight - window.scrollY
    if (this.state == 'enable' && remain < this.remainHeight) {
          this.request()
    }
}

AutoPager.prototype.stateToggle = function() {
    if (this.state == 'enable') {
        this.disable()
    }
    else {
        this.enable()
    }
}

AutoPager.prototype.enable = function() {
    this.state = 'enable'
    this.updateIcon()
}

AutoPager.prototype.disable = function() {
    this.state = 'disable'
    this.updateIcon()
}

AutoPager.prototype.updateIcon = function(state) {
    var st = state || this.state
    var rename = {'enable': 'on', 'disable': 'off' }
    if (rename[st]) {
        st = rename[st]
    }
    var color = COLOR[st]
    if (color && this.icon) {
        this.icon.style.background = color
    }
}

AutoPager.prototype.request = function() {
    if (!this.requestURL || this.lastRequestURL == this.requestURL) {
        return
    }
    this.lastRequestURL = this.requestURL
    var self = this
    var mime = 'text/html; charset=' + document.characterSet

    if (!isSameDomain(this.requestURL)) {
        this.error()
        return
    }
    var opt = {
        method: 'get',
        url: this.requestURL,
        headers: {},
        overrideMimeType: mime,
        onerror: function() {
            self.error()
        },
        onload: function(res) {
            if (res.finalUrl) {
                var url_s = res.finalUrl.split(/[/?]/)
                if (url_s[0] == location.protocol && location.host == url_s[2]) {
                    self.requestLoad.apply(self, [res])
                    return
                }
            }
            self.error()
        }
    }
    AutoPager.requestFilters.forEach(function(i) { i(opt) }, this)
    if (opt.stop) {
        this.requestURL = opt.url
    }
    else {
        this.showLoading(true)
        // the next page is in the same origin, so the page's XMLHttpRequest
        // is used. cookies and the character set are handled by the browser.
        sameOriginRequest(opt)
    }
}

AutoPager.prototype.showLoading = function(sw) {
    this.updateIcon(sw ? 'loading' : 'enable')
}

AutoPager.prototype.requestLoad = function(res) {
    AutoPager.responseFilters.forEach(function(i) {
        i(res, this.requestURL)
    }, this)
    var htmlDoc = createHTMLDocumentByString(res.responseText)
    AutoPager.documentFilters.forEach(function(i) {
        i(htmlDoc, this.requestURL, this.info)
    }, this)
    var page, url
    try {
        page = getElementsByXPath(this.info.pageElement, htmlDoc)
        url = this.getNextURL(this.info.nextLink, htmlDoc, this.requestURL)
    }
    catch(e){
        log(e)
        this.error()
        return
    }

    if (!page || page.length < 1 ) {
        debug('pageElement not found.' , this.info.pageElement)
        this.terminate()
        return
    }

    if (this.loadedURLs[this.requestURL]) {
        debug('page is already loaded.', this.requestURL, this.info.nextLink)
        this.terminate()
        return
    }

    this.loadedURLs[this.requestURL] = true
    page = this.addPage(htmlDoc, page)
    AutoPager.filters.forEach(function(i) {
        i(page)
    })
    this.requestURL = url
    this.showLoading(false)
    this.onScroll()
    if (!url) {
        debug('nextLink not found.', this.info.nextLink, htmlDoc)
        this.terminate()
    }
    document.dispatchEvent(new Event('GM_AutoPagerizeNextPageLoaded',
                                     { bubbles: true, cancelable: false }))
}

AutoPager.prototype.addPage = function(htmlDoc, page) {
    var HTML_NS  = 'http://www.w3.org/1999/xhtml'
    var hr = document.createElementNS(HTML_NS, 'hr')
    var p  = document.createElementNS(HTML_NS, 'p')
    hr.setAttribute('class', 'autopagerize_page_separator')
    p.setAttribute('class', 'autopagerize_page_info')
    var self = this

    if (page[0] && /tr/i.test(page[0].tagName)) {
        var insertParent = this.insertPoint.parentNode
        var colNodes = getElementsByXPath('child::tr[1]/child::*[self::td or self::th]', insertParent)

        var colums = 0
        for (var i = 0, l = colNodes.length; i < l; i++) {
            var col = colNodes[i].getAttribute('colspan')
            colums += parseInt(col, 10) || 1
        }
        var td = document.createElement('td')
        // td.appendChild(hr)
        td.appendChild(p)
        var tr = document.createElement('tr')
        td.setAttribute('colspan', colums)
        tr.appendChild(td)
        insertParent.insertBefore(tr, this.insertPoint)
    }
    else {
        this.insertPoint.parentNode.insertBefore(hr, this.insertPoint)
        this.insertPoint.parentNode.insertBefore(p, this.insertPoint)
    }

    p.textContent = 'page: '
    var pageLink = document.createElement('a')
    pageLink.setAttribute('class', 'autopagerize_link')
    pageLink.href = this.requestURL
    pageLink.textContent = ++this.pageNum
    p.appendChild(pageLink)

    return page.map(function(i) {
        var pe = document.importNode(i, true)
        self.insertPoint.parentNode.insertBefore(pe, self.insertPoint)
        // MutationEvent is removed from recent browsers.
        var ev = new CustomEvent('AutoPagerize_DOMNodeInserted', {
            bubbles: true, cancelable: false,
            detail: { relatedNode: self.insertPoint.parentNode,
                      newValue: self.requestURL }
        })
        pe.dispatchEvent(ev)
        return pe
    })
}

AutoPager.prototype.initIcon = function() {
    var div = document.createElement("div")
    div.setAttribute('id', 'autopagerize_icon')
    var style = div.style
    style.fontSize   = '12px'
    style.position   = 'fixed'
    style.top        = '3px'
    style.right      = '3px'
    style.background = (this.state == 'enable') ? COLOR['on'] : COLOR['off']
    style.color      = '#fff'
    style.width      = '10px'
    style.height     = '10px'
    style.zIndex     = '255'
    document.body.appendChild(div)
    this.icon = div
}

AutoPager.prototype.getNextURL = function(xpath, doc, url) {
    var nextLink = getFirstElementByXPath(xpath, doc)
    if (nextLink) {
        var nextValue = nextLink.getAttribute('href') ||
            nextLink.getAttribute('action') || nextLink.value
        if (nextValue.match(/^http(s)?:/)) {
            return nextValue
        }
        else {
            var base = getFirstElementByXPath('//base[@href]', doc)
            var baseUrl = base ? resolvePath(base.getAttribute('href'), url) : url
            return resolvePath(nextValue, baseUrl)
        }
    }
}

AutoPager.prototype.terminate = function() {
    window.removeEventListener('scroll', this.scroll, false)
    this.updateIcon('terminated')
    var self = this
    setTimeout(function() {
        if (self.icon && self.icon.parentNode) {
            self.icon.parentNode.removeChild(self.icon)
        }
    }, 1500)
}

AutoPager.prototype.error = function() {
    this.updateIcon('error')
    window.removeEventListener('scroll', this.scroll, false)
}

AutoPager.documentFilters = []
AutoPager.requestFilters = []
AutoPager.responseFilters = []
AutoPager.filters = []

var launchAutoPager = function(list) {
    if (list.length == 0) {
        return
    }
    for (var i = 0; i < list.length; i++) {
        try {
            if (ap) {
                return
            }
            else if (!location.href.match(list[i].url)) {
                continue
            }
            else if (!getFirstElementByXPath(list[i].nextLink)) {
                // FIXME microformats case detection.
                // limiting greater than 12 to filter microformats like SITEINFOs.
                if (list[i].url.length > 12 ) {
                    debug("nextLink not found.", list[i].nextLink)
                }
            }
            else if (!getFirstElementByXPath(list[i].pageElement)) {
                if (list[i].url.length > 12 ) {
                    debug("pageElement not found.", list[i].pageElement)
                }
            }
            else {
                ap = new AutoPager(list[i])
                return
            }
        }
        catch(e) {
            log(e)
            continue
        }
    }
}
var clearCache = function() {
    gm.setValue('cacheInfo', '')
}
var getCache = function() {
    try {
        return JSON.parse(gm.getValue('cacheInfo')) || {}
    }
    catch(e) {
        return {}
    }
}
var saveCache = function() {
    gm.setValue('cacheInfo', JSON.stringify(cacheInfo))
}

// wedata JSON: [{ data: { url, nextLink, pageElement, ... } }, ...]
function parseWedataJSON(text) {
    return reduceSiteinfo(JSON.parse(text))
}

// siteinfo.js of AutoPagerize X: loadLocalSiteinfoCallback([...], "date")
function parseBundledSiteinfo(text) {
    var head = text.indexOf('loadLocalSiteinfoCallback(')
    var start = text.indexOf('[', head)
    var end = text.lastIndexOf(']')
    if (head < 0 || start < 0 || end < start) {
        return []
    }
    return reduceSiteinfo(JSON.parse(text.slice(start, end + 1)))
}

function reduceSiteinfo(data) {
    var r_keys = ['url', 'nextLink', 'insertBefore', 'pageElement']
    var info = (data || []).map(function(i) {
        return i && i.data
    }).filter(function(i) {
        return i && i.url && i.nextLink && i.pageElement
    })
    info.sort(function(a, b) { return (b.url.length - a.url.length) })
    return info.map(function(i) {
        var item = {}
        r_keys.forEach(function(key) {
            if (i[key]) {
                item[key] = i[key]
            }
        })
        return item
    })
}

// tries the sources in order and calls back with the first valid SITEINFO.
var fetchSiteinfo = function(sources, callback) {
    if (sources.length == 0) {
        callback(null, null)
        return
    }
    var source = sources[0]
    var done = false
    var next = function() {
        if (!done) {
            done = true
            debug('SITEINFO not available.', source.url)
            fetchSiteinfo(sources.slice(1), callback)
        }
    }
    var timer = setTimeout(next, XHR_TIMEOUT)
    try {
        gm.xmlhttpRequest({
            method: 'GET',
            url: source.url,
            timeout: XHR_TIMEOUT,
            onload: function(res) {
                if (done) {
                    return
                }
                var info = null
                if (res.status == 200) {
                    try {
                        info = source.parse(res.responseText)
                    }
                    catch(e) {
                        info = null
                    }
                }
                if (info && info.length > 0) {
                    done = true
                    clearTimeout(timer)
                    callback(info, source.url)
                }
                else {
                    clearTimeout(timer)
                    next()
                }
            },
            onerror: function() {
                clearTimeout(timer)
                next()
            },
            ontimeout: function() {
                clearTimeout(timer)
                next()
            }
        })
    }
    catch(e) {
        clearTimeout(timer)
        next()
    }
}

var linkFilter = function(doc, url) {
    var base = getFirstElementByXPath('//base[@href]', doc)
    var baseUrl = base ? resolvePath(base.getAttribute('href'), url) : url
    var isSameBase = isSameBaseUrl(location.href, baseUrl)
    if (!FORCE_TARGET_WINDOW && isSameBase) {
        return
    }

    var anchors = getElementsByXPath('descendant-or-self::a[@href]', doc)
    anchors.forEach(function(i) {
        var attrHref = i.getAttribute('href')
        if (FORCE_TARGET_WINDOW && !attrHref.match(/^#|^javascript:/) &&
            i.className.indexOf('autopagerize_link') < 0) {
            i.target = '_blank'
        }
        if (!isSameBase && !attrHref.match(/^#|^\w+:/)) {
            i.setAttribute('href', resolvePath(attrHref, baseUrl))
        }
    })

    if (!isSameBase) {
        var images = getElementsByXPath('descendant-or-self::img[@src]', doc)
        images.forEach(function(i) {
            i.setAttribute('src', resolvePath(i.getAttribute('src'), baseUrl))
        })
    }
}
AutoPager.documentFilters.push(linkFilter)

if (typeof(window.AutoPagerize) == 'undefined') {
    window.AutoPagerize = {}
    window.AutoPagerize.addFilter = function(f) {
        AutoPager.filters.push(f)
    }
    window.AutoPagerize.addDocumentFilter = function(f) {
        AutoPager.documentFilters.push(f)
    }
    window.AutoPagerize.addResponseFilter = function(f) {
        AutoPager.responseFilters.push(f)
    }
    window.AutoPagerize.addRequestFilter = function(f) {
        AutoPager.requestFilters.push(f)
    }
    window.AutoPagerize.launchAutoPager = launchAutoPager

    document.dispatchEvent(new Event('GM_AutoPagerizeLoaded',
                                     { bubbles: true, cancelable: false }))
}

var ap = null
var cacheInfo = {}

gm.load(['cacheInfo', 'exclude_patterns', 'force_target_window'], function() {
    FORCE_TARGET_WINDOW = gm.getValue('force_target_window', true)
    var ep = gm.getValue('exclude_patterns')
    if (ep && isExclude(ep)) {
        return
    }
    launch()
})

function launch() {
    launchAutoPager(SITEINFO)
    gm.registerMenuCommand('AutoPagerize - clear cache', clearCache)
    cacheInfo = getCache()
    var cache = cacheInfo[SITEINFO_CACHE_KEY]
    if (cache && cache.info && cache.info.length > 0) {
        launchAutoPager(cache.info)
    }
    if (!cache || !(new Date(cache.expire) >= new Date())) {
        fetchSiteinfo(SITEINFO_SOURCES, function(info, url) {
            var now = new Date().getTime()
            if (info) {
                cacheInfo = {}
                cacheInfo[SITEINFO_CACHE_KEY] = {
                    url: url,
                    expire: new Date(now + CACHE_EXPIRE),
                    info: info
                }
                saveCache()
                launchAutoPager(info)
            }
            else {
                // keep the old SITEINFO and retry later.
                cacheInfo = {}
                cacheInfo[SITEINFO_CACHE_KEY] = {
                    url: cache ? cache.url : null,
                    expire: new Date(now + SITEINFO_RETRY),
                    info: cache ? cache.info : []
                }
                saveCache()
            }
        })
    }
    launchAutoPager([MICROFORMAT])
}


// utility functions.

// Wraps the APIs of userscript managers. Greasemonkey 4, Tampermonkey,
// Violentmonkey and Safari userscript managers (Userscripts, Stay, Macaque)
// provide the synchronous GM_* API and/or the asynchronous GM.* API.
function createGMAdapter() {
    var hasGM = (typeof GM == 'object') && GM !== null
    var gmFunction = function(name) {
        return (hasGM && typeof GM[name] == 'function') ?
            GM[name].bind(GM) : null
    }
    var syncGetValue = (typeof GM_getValue == 'function') ? GM_getValue : null
    var syncSetValue = (typeof GM_setValue == 'function') ? GM_setValue : null
    var asyncGetValue = gmFunction('getValue')
    var asyncSetValue = gmFunction('setValue')
    var addStyleFn = (typeof GM_addStyle == 'function') ? GM_addStyle :
        gmFunction('addStyle')
    var xhrFn = (typeof GM_xmlhttpRequest == 'function') ? GM_xmlhttpRequest :
        (gmFunction('xmlHttpRequest') || gmFunction('xmlhttpRequest'))
    var menuFn = (typeof GM_registerMenuCommand == 'function') ?
        GM_registerMenuCommand : gmFunction('registerMenuCommand')
    var values = {}

    return {
        // values are loaded before launch, so that getValue can be synchronous.
        load: function(keys, callback) {
            if (asyncGetValue) {
                Promise.all(keys.map(function(key) {
                    return Promise.resolve(asyncGetValue(key)).then(function(value) {
                        if (typeof value != 'undefined') {
                            values[key] = value
                        }
                    }, function() {})
                })).then(callback, callback)
                return
            }
            if (syncGetValue) {
                keys.forEach(function(key) {
                    var value = syncGetValue(key)
                    if (typeof value != 'undefined') {
                        values[key] = value
                    }
                })
            }
            callback()
        },
        getValue: function(key, defaultValue) {
            return (key in values) ? values[key] : defaultValue
        },
        setValue: function(key, value) {
            values[key] = value
            try {
                if (asyncSetValue) {
                    Promise.resolve(asyncSetValue(key, value)).catch(log)
                }
                else if (syncSetValue) {
                    syncSetValue(key, value)
                }
            }
            catch(e) {
                log(e)
            }
        },
        addStyle: function(css) {
            if (addStyleFn) {
                try {
                    addStyleFn(css)
                    return
                }
                catch(e) {
                    log(e)
                }
            }
            var style = document.createElement('style')
            style.textContent = css
            ;(document.head || document.documentElement).appendChild(style)
        },
        xmlhttpRequest: function(opt) {
            if (xhrFn) {
                xhrFn(opt)
            }
            else {
                sameOriginRequest(opt)
            }
        },
        registerMenuCommand: function(name, fn) {
            if (menuFn) {
                try {
                    menuFn(name, fn)
                }
                catch(e) {
                    log(e)
                }
            }
        }
    }
}

function sameOriginRequest(opt) {
    var xhr = new XMLHttpRequest()
    xhr.open(opt.method || 'GET', opt.url, true)
    var forbidden = /^(cookie|cookie2|host|referer|user-agent)$/i
    var headers = opt.headers || {}
    for (var name in headers) {
        if (!forbidden.test(name)) {
            xhr.setRequestHeader(name, headers[name])
        }
    }
    if (opt.overrideMimeType) {
        xhr.overrideMimeType(opt.overrideMimeType)
    }
    xhr.timeout = XHR_TIMEOUT
    var response = function() {
        return {
            status: xhr.status,
            statusText: xhr.statusText,
            responseText: xhr.responseText,
            responseHeaders: xhr.getAllResponseHeaders(),
            finalUrl: xhr.responseURL || opt.url
        }
    }
    xhr.onload = function() {
        if (opt.onload) {
            opt.onload(response())
        }
    }
    xhr.onerror = xhr.ontimeout = function() {
        if (opt.onerror) {
            opt.onerror(response())
        }
    }
    xhr.send(opt.data || null)
}

// scripts in a document made by DOMParser are never executed.
function createHTMLDocumentByString(str) {
    var type = (document.documentElement.nodeName != 'HTML') ?
        'application/xhtml+xml' : 'text/html'
    return new DOMParser().parseFromString(str, type)
}

function getElementsByXPath(xpath, node) {
    var nodesSnapshot = getXPathResult(xpath, node,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE)
    var data = []
    for (var i = 0; i < nodesSnapshot.snapshotLength; i++) {
        data.push(nodesSnapshot.snapshotItem(i))
    }
    return data
}

function getFirstElementByXPath(xpath, node) {
    var result = getXPathResult(xpath, node,
        XPathResult.FIRST_ORDERED_NODE_TYPE)
    return result.singleNodeValue
}

function getXPathResult(xpath, node, resultType) {
    node = node || document
    var doc = node.ownerDocument || node
    var resolverNode = node.documentElement || node
    var resolver = (typeof doc.createNSResolver == 'function') ?
        doc.createNSResolver(resolverNode) : resolverNode
    // A workaround for bugs of Node.lookupNamespaceURI(null)
    // https://bugzilla.mozilla.org/show_bug.cgi?id=693615
    // https://bugzilla.mozilla.org/show_bug.cgi?id=694754
    var defaultNS = null
    try {
        // This follows the spec: http://www.w3.org/TR/DOM-Level-3-Core/namespaces-algorithms.html#lookupNamespaceURIAlgo
        if (node.nodeType == node.DOCUMENT_NODE) {
            defaultNS = node.documentElement.lookupNamespaceURI(null)
        }
        else {
            defaultNS = node.lookupNamespaceURI(null)
        }
    }
    catch(e) {
        defaultNS = null
    }

    // HTML documents made by DOMParser have the XHTML namespace,
    // but XPath for HTML documents works without prefix.
    if (defaultNS && doc.contentType != 'text/html') {
        var defaultPrefix = '__default__'
        xpath = addDefaultPrefix(xpath, defaultPrefix)
        var defaultResolver = resolver
        resolver = function (prefix) {
            return (prefix == defaultPrefix)
                ? defaultNS : defaultResolver.lookupNamespaceURI(prefix)
        }
    }
    return doc.evaluate(xpath, node, resolver, resultType, null)
}

function addDefaultPrefix(xpath, prefix) {
    var tokenPattern = /([A-Za-z_À-�][\w\-.·-�]*|\*)\s*(::?|\()?|(".*?"|'.*?'|\d+(?:\.\d*)?|\.(?:\.|\d+)?|[)\]])|(\/\/?|!=|[<>]=?|[([|,=+-])|([@$])/g
    var TERM = 1, OPERATOR = 2, MODIFIER = 3
    var tokenType = OPERATOR
    prefix += ':'
    function replacer(token, identifier, suffix, term, operator) {
        if (suffix) {
            tokenType =
                (suffix == ':' || (suffix == '::' &&
                 (identifier == 'attribute' || identifier == 'namespace')))
                ? MODIFIER : OPERATOR
        }
        else if (identifier) {
            if (tokenType == OPERATOR && identifier != '*') {
                token = prefix + token
            }
            tokenType = (tokenType == TERM) ? OPERATOR : TERM
        }
        else {
            tokenType = term ? TERM : operator ? OPERATOR : MODIFIER
        }
        return token
    }
    return xpath.replace(tokenPattern, replacer)
}

function log(message) {
    console.log(message)
}

function debug() {
    if (DEBUG) {
        console.log.apply(console, arguments)
    }
}

function getElementPosition(elem) {
    var offsetTrail = elem
    var offsetLeft  = 0
    var offsetTop   = 0
    while (offsetTrail) {
        offsetLeft += offsetTrail.offsetLeft
        offsetTop  += offsetTrail.offsetTop
        offsetTrail = offsetTrail.offsetParent
    }
    offsetTop = offsetTop || null
    offsetLeft = offsetLeft || null
    return {left: offsetLeft, top: offsetTop}
}

function getElementBottom(elem) {
    var c_style = document.defaultView.getComputedStyle(elem, '')
    var height  = 0
    var prop    = ['height', 'borderTopWidth', 'borderBottomWidth',
                   'paddingTop', 'paddingBottom',
                   'marginTop', 'marginBottom']
    prop.forEach(function(i) {
        var h = parseInt(c_style[i])
        if (!isNaN(h)) {
            height += h
        }
    })
    var top = getElementPosition(elem).top
    return top ? (top + height) : null
}

function getScrollHeight() {
    return Math.max(document.documentElement.scrollHeight,
                                document.body.scrollHeight)
}

function isSameDomain(url) {
    if (url.match(/^\w+:/)) {
        var url_s = url.split(/[/?]/)
        return url_s[0] == location.protocol && location.host == url_s[2]
    }
    else {
        return true
    }
}

function isSameBaseUrl(urlA, urlB) {
    return (urlA.replace(/[^/]+$/, '') == urlB.replace(/[^/]+$/, ''))
}

function resolvePath(path, base) {
    try {
        return new window.URL(path, base).href
    }
    catch(e) {
        return path
    }
}

function wildcard2regep(str) {
    return '^' + str.replace(/([-()[\]{}+?.$^|,:#<!\\])/g, '\\$1').replace(/\*/g, '.*')
}

function isExclude(patterns) {
    var rr = /^\/(.+)\/$/
    var eps = (patterns || '').split(/[\r\n ]+/)
    for (var i = 0; i < eps.length; i++) {
        if (!eps[i]) {
            continue
        }
        var reg = null
        if (rr.test(eps[i])) {
            reg = eps[i].match(rr)[1]
        }
        else {
            reg = wildcard2regep(eps[i])
        }
        if (location.href.match(reg)) {
            return true
        }
    }
    return false
}

})()
