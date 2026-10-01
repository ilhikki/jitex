/**
 * CM 各族的「码位 → Unicode」。**生成物，勿手改。**
 *
 * 来源：CTAN fonts/amsfonts/afm/ 的 *.afm，每个字体自己的
 *       "C 码位 ; WX 宽 ; N 字形名" -- TeX 不是全局用 OT1，共 10 种编码；
 *       同名字形在不同族里还可能语义不同（cmsy 的 bar 是 \mid，文本字体的 bar 是 |）。
 * 生成：resources/fonts/tools/gen-encodings.py（审计报告见该目录 README 说明的位置）
 *
 * 表项两种形态：
 *   number -- 该码位字形的 Unicode 码点
 *   null   -- 该字体在这个码位上没有字形（TeX 本不该用），按原码直出
 *
 * 少数字形在 Unicode 里**没有身份**（cmex 的尺寸档与拼装件、OT1 的 suppress…）。
 * 它们照样给了码点，但取的是 **Unicode 私用区 U+E000 起**的保留位：合法码点、
 * 不与任何真字符冲突、字体里也照着同一个位置放了那个字形。这是明说的取舍--
 * cmex10 这类"多档同形"的字体放弃了 Unicode 语义（U+E0xx 不代表任何字符，
 * 就是"第几档左圆括号"），换来的是每一档都拿得到、尺寸不会错。
 * 文本字体不受影响：它们的 0x00..0x7F 全是真 Unicode。
 * 分配表见 .build/fonts/encodings-report.txt（U+E000 起，按名字序稳定分配）。
 */
export type CodeTable = readonly (number | null)[]

/**
 * ot1：cmb10 cmbx10 cmbx12 cmbx5 cmbx6 cmbx7 cmbx8 cmbx9 cmbxsl10 cmdunh10 cmr10 cmr12 cmr17 cmr6 cmr7 cmr8 cmr9 cmsl10 cmsl12 cmsl8 cmsl9 cmss10 cmss12 cmss17 cmss8 cmss9 cmssbx10 cmssdc10 cmssi10 cmssi12 cmssi17 cmssi8 cmssi9 cmssq8 cmssqi8 cmvtt10
 * 取自 cmr10.afm
 */
const ENC_OT1: CodeTable = [
  0x0393, // Gamma
  0x0394, // Delta
  0x0398, // Theta
  0x039B, // Lambda
  0x039E, // Xi
  0x03A0, // Pi
  0x03A3, // Sigma
  0x03A5, // Upsilon
  0x03A6, // Phi
  0x03A8, // Psi
  0x03A9, // Omega
  0xFB00, // ff
  0xFB01, // fi
  0xFB02, // fl
  0xFB03, // ffi
  0xFB04, // ffl
  0x0131, // dotlessi
  0x0237, // dotlessj
  0x0060, // grave
  0x00B4, // acute
  0x02C7, // caron
  0x02D8, // breve
  0x00AF, // macron
  0x02DA, // ring
  0x00B8, // cedilla
  0x00DF, // germandbls
  0x00E6, // ae
  0x0153, // oe
  0x00F8, // oslash
  0x00C6, // AE
  0x0152, // OE
  0x00D8, // Oslash
  0xE056, // suppress：Unicode 里没有身份，用私用区保留位
  0x0021, // exclam（就是 ASCII）
  0x201D, // quotedblright
  0x0023, // numbersign（就是 ASCII）
  0x0024, // dollar（就是 ASCII）
  0x0025, // percent（就是 ASCII）
  0x0026, // ampersand（就是 ASCII）
  0x2019, // quoteright
  0x0028, // parenleft（就是 ASCII）
  0x0029, // parenright（就是 ASCII）
  0x002A, // asterisk（就是 ASCII）
  0x002B, // plus（就是 ASCII）
  0x002C, // comma（就是 ASCII）
  0x002D, // hyphen（就是 ASCII）
  0x002E, // period（就是 ASCII）
  0x002F, // slash（就是 ASCII）
  0x0030, // zero（就是 ASCII）
  0x0031, // one（就是 ASCII）
  0x0032, // two（就是 ASCII）
  0x0033, // three（就是 ASCII）
  0x0034, // four（就是 ASCII）
  0x0035, // five（就是 ASCII）
  0x0036, // six（就是 ASCII）
  0x0037, // seven（就是 ASCII）
  0x0038, // eight（就是 ASCII）
  0x0039, // nine（就是 ASCII）
  0x003A, // colon（就是 ASCII）
  0x003B, // semicolon（就是 ASCII）
  0x00A1, // exclamdown
  0x003D, // equal（就是 ASCII）
  0x00BF, // questiondown
  0x003F, // question（就是 ASCII）
  0x0040, // at（就是 ASCII）
  0x0041, // A（就是 ASCII）
  0x0042, // B（就是 ASCII）
  0x0043, // C（就是 ASCII）
  0x0044, // D（就是 ASCII）
  0x0045, // E（就是 ASCII）
  0x0046, // F（就是 ASCII）
  0x0047, // G（就是 ASCII）
  0x0048, // H（就是 ASCII）
  0x0049, // I（就是 ASCII）
  0x004A, // J（就是 ASCII）
  0x004B, // K（就是 ASCII）
  0x004C, // L（就是 ASCII）
  0x004D, // M（就是 ASCII）
  0x004E, // N（就是 ASCII）
  0x004F, // O（就是 ASCII）
  0x0050, // P（就是 ASCII）
  0x0051, // Q（就是 ASCII）
  0x0052, // R（就是 ASCII）
  0x0053, // S（就是 ASCII）
  0x0054, // T（就是 ASCII）
  0x0055, // U（就是 ASCII）
  0x0056, // V（就是 ASCII）
  0x0057, // W（就是 ASCII）
  0x0058, // X（就是 ASCII）
  0x0059, // Y（就是 ASCII）
  0x005A, // Z（就是 ASCII）
  0x005B, // bracketleft（就是 ASCII）
  0x201C, // quotedblleft
  0x005D, // bracketright（就是 ASCII）
  0x02C6, // circumflex
  0x02D9, // dotaccent
  0x2018, // quoteleft
  0x0061, // a（就是 ASCII）
  0x0062, // b（就是 ASCII）
  0x0063, // c（就是 ASCII）
  0x0064, // d（就是 ASCII）
  0x0065, // e（就是 ASCII）
  0x0066, // f（就是 ASCII）
  0x0067, // g（就是 ASCII）
  0x0068, // h（就是 ASCII）
  0x0069, // i（就是 ASCII）
  0x006A, // j（就是 ASCII）
  0x006B, // k（就是 ASCII）
  0x006C, // l（就是 ASCII）
  0x006D, // m（就是 ASCII）
  0x006E, // n（就是 ASCII）
  0x006F, // o（就是 ASCII）
  0x0070, // p（就是 ASCII）
  0x0071, // q（就是 ASCII）
  0x0072, // r（就是 ASCII）
  0x0073, // s（就是 ASCII）
  0x0074, // t（就是 ASCII）
  0x0075, // u（就是 ASCII）
  0x0076, // v（就是 ASCII）
  0x0077, // w（就是 ASCII）
  0x0078, // x（就是 ASCII）
  0x0079, // y（就是 ASCII）
  0x007A, // z（就是 ASCII）
  0x2013, // endash
  0x2014, // emdash
  0x02DD, // hungarumlaut
  0x02DC, // tilde
  0x00A8, // dieresis
]

/**
 * ot1-italic：cmbxti10 cmff10 cmfi10 cmfib8 cmti10 cmti12 cmti7 cmti8 cmti9 cmu10
 * 取自 cmti10.afm
 */
const ENC_OT1_ITALIC: CodeTable = [
  0x0393, // Gamma
  0x0394, // Delta
  0x0398, // Theta
  0x039B, // Lambda
  0x039E, // Xi
  0x03A0, // Pi
  0x03A3, // Sigma
  0x03A5, // Upsilon
  0x03A6, // Phi
  0x03A8, // Psi
  0x03A9, // Omega
  0xFB00, // ff
  0xFB01, // fi
  0xFB02, // fl
  0xFB03, // ffi
  0xFB04, // ffl
  0x0131, // dotlessi
  0x0237, // dotlessj
  0x0060, // grave
  0x00B4, // acute
  0x02C7, // caron
  0x02D8, // breve
  0x00AF, // macron
  0x02DA, // ring
  0x00B8, // cedilla
  0x00DF, // germandbls
  0x00E6, // ae
  0x0153, // oe
  0x00F8, // oslash
  0x00C6, // AE
  0x0152, // OE
  0x00D8, // Oslash
  0xE056, // suppress：Unicode 里没有身份，用私用区保留位
  0x0021, // exclam（就是 ASCII）
  0x201D, // quotedblright
  0x0023, // numbersign（就是 ASCII）
  0x00A3, // sterling
  0x0025, // percent（就是 ASCII）
  0x0026, // ampersand（就是 ASCII）
  0x2019, // quoteright
  0x0028, // parenleft（就是 ASCII）
  0x0029, // parenright（就是 ASCII）
  0x002A, // asterisk（就是 ASCII）
  0x002B, // plus（就是 ASCII）
  0x002C, // comma（就是 ASCII）
  0x002D, // hyphen（就是 ASCII）
  0x002E, // period（就是 ASCII）
  0x002F, // slash（就是 ASCII）
  0x0030, // zero（就是 ASCII）
  0x0031, // one（就是 ASCII）
  0x0032, // two（就是 ASCII）
  0x0033, // three（就是 ASCII）
  0x0034, // four（就是 ASCII）
  0x0035, // five（就是 ASCII）
  0x0036, // six（就是 ASCII）
  0x0037, // seven（就是 ASCII）
  0x0038, // eight（就是 ASCII）
  0x0039, // nine（就是 ASCII）
  0x003A, // colon（就是 ASCII）
  0x003B, // semicolon（就是 ASCII）
  0x00A1, // exclamdown
  0x003D, // equal（就是 ASCII）
  0x00BF, // questiondown
  0x003F, // question（就是 ASCII）
  0x0040, // at（就是 ASCII）
  0x0041, // A（就是 ASCII）
  0x0042, // B（就是 ASCII）
  0x0043, // C（就是 ASCII）
  0x0044, // D（就是 ASCII）
  0x0045, // E（就是 ASCII）
  0x0046, // F（就是 ASCII）
  0x0047, // G（就是 ASCII）
  0x0048, // H（就是 ASCII）
  0x0049, // I（就是 ASCII）
  0x004A, // J（就是 ASCII）
  0x004B, // K（就是 ASCII）
  0x004C, // L（就是 ASCII）
  0x004D, // M（就是 ASCII）
  0x004E, // N（就是 ASCII）
  0x004F, // O（就是 ASCII）
  0x0050, // P（就是 ASCII）
  0x0051, // Q（就是 ASCII）
  0x0052, // R（就是 ASCII）
  0x0053, // S（就是 ASCII）
  0x0054, // T（就是 ASCII）
  0x0055, // U（就是 ASCII）
  0x0056, // V（就是 ASCII）
  0x0057, // W（就是 ASCII）
  0x0058, // X（就是 ASCII）
  0x0059, // Y（就是 ASCII）
  0x005A, // Z（就是 ASCII）
  0x005B, // bracketleft（就是 ASCII）
  0x201C, // quotedblleft
  0x005D, // bracketright（就是 ASCII）
  0x02C6, // circumflex
  0x02D9, // dotaccent
  0x2018, // quoteleft
  0x0061, // a（就是 ASCII）
  0x0062, // b（就是 ASCII）
  0x0063, // c（就是 ASCII）
  0x0064, // d（就是 ASCII）
  0x0065, // e（就是 ASCII）
  0x0066, // f（就是 ASCII）
  0x0067, // g（就是 ASCII）
  0x0068, // h（就是 ASCII）
  0x0069, // i（就是 ASCII）
  0x006A, // j（就是 ASCII）
  0x006B, // k（就是 ASCII）
  0x006C, // l（就是 ASCII）
  0x006D, // m（就是 ASCII）
  0x006E, // n（就是 ASCII）
  0x006F, // o（就是 ASCII）
  0x0070, // p（就是 ASCII）
  0x0071, // q（就是 ASCII）
  0x0072, // r（就是 ASCII）
  0x0073, // s（就是 ASCII）
  0x0074, // t（就是 ASCII）
  0x0075, // u（就是 ASCII）
  0x0076, // v（就是 ASCII）
  0x0077, // w（就是 ASCII）
  0x0078, // x（就是 ASCII）
  0x0079, // y（就是 ASCII）
  0x007A, // z（就是 ASCII）
  0x2013, // endash
  0x2014, // emdash
  0x02DD, // hungarumlaut
  0x02DC, // tilde
  0x00A8, // dieresis
]

/**
 * ot1-nolig：cmcsc10 cmr5
 * 取自 cmr5.afm
 */
const ENC_OT1_NOLIG: CodeTable = [
  0x0393, // Gamma
  0x0394, // Delta
  0x0398, // Theta
  0x039B, // Lambda
  0x039E, // Xi
  0x03A0, // Pi
  0x03A3, // Sigma
  0x03A5, // Upsilon
  0x03A6, // Phi
  0x03A8, // Psi
  0x03A9, // Omega
  0x2191, // arrowup
  0x2193, // arrowdown
  0x0027, // quotesingle
  0x00A1, // exclamdown
  0x00BF, // questiondown
  0x0131, // dotlessi
  0x0237, // dotlessj
  0x0060, // grave
  0x00B4, // acute
  0x02C7, // caron
  0x02D8, // breve
  0x00AF, // macron
  0x02DA, // ring
  0x00B8, // cedilla
  0x00DF, // germandbls
  0x00E6, // ae
  0x0153, // oe
  0x00F8, // oslash
  0x00C6, // AE
  0x0152, // OE
  0x00D8, // Oslash
  0xE056, // suppress：Unicode 里没有身份，用私用区保留位
  0x0021, // exclam（就是 ASCII）
  0x201D, // quotedblright
  0x0023, // numbersign（就是 ASCII）
  0x0024, // dollar（就是 ASCII）
  0x0025, // percent（就是 ASCII）
  0x0026, // ampersand（就是 ASCII）
  0x2019, // quoteright
  0x0028, // parenleft（就是 ASCII）
  0x0029, // parenright（就是 ASCII）
  0x002A, // asterisk（就是 ASCII）
  0x002B, // plus（就是 ASCII）
  0x002C, // comma（就是 ASCII）
  0x002D, // hyphen（就是 ASCII）
  0x002E, // period（就是 ASCII）
  0x002F, // slash（就是 ASCII）
  0x0030, // zero（就是 ASCII）
  0x0031, // one（就是 ASCII）
  0x0032, // two（就是 ASCII）
  0x0033, // three（就是 ASCII）
  0x0034, // four（就是 ASCII）
  0x0035, // five（就是 ASCII）
  0x0036, // six（就是 ASCII）
  0x0037, // seven（就是 ASCII）
  0x0038, // eight（就是 ASCII）
  0x0039, // nine（就是 ASCII）
  0x003A, // colon（就是 ASCII）
  0x003B, // semicolon（就是 ASCII）
  0x003C, // less（就是 ASCII）
  0x003D, // equal（就是 ASCII）
  0x003E, // greater（就是 ASCII）
  0x003F, // question（就是 ASCII）
  0x0040, // at（就是 ASCII）
  0x0041, // A（就是 ASCII）
  0x0042, // B（就是 ASCII）
  0x0043, // C（就是 ASCII）
  0x0044, // D（就是 ASCII）
  0x0045, // E（就是 ASCII）
  0x0046, // F（就是 ASCII）
  0x0047, // G（就是 ASCII）
  0x0048, // H（就是 ASCII）
  0x0049, // I（就是 ASCII）
  0x004A, // J（就是 ASCII）
  0x004B, // K（就是 ASCII）
  0x004C, // L（就是 ASCII）
  0x004D, // M（就是 ASCII）
  0x004E, // N（就是 ASCII）
  0x004F, // O（就是 ASCII）
  0x0050, // P（就是 ASCII）
  0x0051, // Q（就是 ASCII）
  0x0052, // R（就是 ASCII）
  0x0053, // S（就是 ASCII）
  0x0054, // T（就是 ASCII）
  0x0055, // U（就是 ASCII）
  0x0056, // V（就是 ASCII）
  0x0057, // W（就是 ASCII）
  0x0058, // X（就是 ASCII）
  0x0059, // Y（就是 ASCII）
  0x005A, // Z（就是 ASCII）
  0x005B, // bracketleft（就是 ASCII）
  0x201C, // quotedblleft
  0x005D, // bracketright（就是 ASCII）
  0x02C6, // circumflex
  0x02D9, // dotaccent
  0x2018, // quoteleft
  0x0061, // a（就是 ASCII）
  0x0062, // b（就是 ASCII）
  0x0063, // c（就是 ASCII）
  0x0064, // d（就是 ASCII）
  0x0065, // e（就是 ASCII）
  0x0066, // f（就是 ASCII）
  0x0067, // g（就是 ASCII）
  0x0068, // h（就是 ASCII）
  0x0069, // i（就是 ASCII）
  0x006A, // j（就是 ASCII）
  0x006B, // k（就是 ASCII）
  0x006C, // l（就是 ASCII）
  0x006D, // m（就是 ASCII）
  0x006E, // n（就是 ASCII）
  0x006F, // o（就是 ASCII）
  0x0070, // p（就是 ASCII）
  0x0071, // q（就是 ASCII）
  0x0072, // r（就是 ASCII）
  0x0073, // s（就是 ASCII）
  0x0074, // t（就是 ASCII）
  0x0075, // u（就是 ASCII）
  0x0076, // v（就是 ASCII）
  0x0077, // w（就是 ASCII）
  0x0078, // x（就是 ASCII）
  0x0079, // y（就是 ASCII）
  0x007A, // z（就是 ASCII）
  0x2013, // endash
  0x2014, // emdash
  0x02DD, // hungarumlaut
  0x02DC, // tilde
  0x00A8, // dieresis
]

/**
 * ot1-tt：cmsltt10 cmtcsc10 cmtt10 cmtt12 cmtt8 cmtt9
 * 取自 cmtt10.afm
 */
const ENC_OT1_TT: CodeTable = [
  0x0393, // Gamma
  0x0394, // Delta
  0x0398, // Theta
  0x039B, // Lambda
  0x039E, // Xi
  0x03A0, // Pi
  0x03A3, // Sigma
  0x03A5, // Upsilon
  0x03A6, // Phi
  0x03A8, // Psi
  0x03A9, // Omega
  0x2191, // arrowup
  0x2193, // arrowdown
  0x0027, // quotesingle
  0x00A1, // exclamdown
  0x00BF, // questiondown
  0x0131, // dotlessi
  0x0237, // dotlessj
  0x0060, // grave
  0x00B4, // acute
  0x02C7, // caron
  0x02D8, // breve
  0x00AF, // macron
  0x02DA, // ring
  0x00B8, // cedilla
  0x00DF, // germandbls
  0x00E6, // ae
  0x0153, // oe
  0x00F8, // oslash
  0x00C6, // AE
  0x0152, // OE
  0x00D8, // Oslash
  0x2423, // visiblespace
  0x0021, // exclam（就是 ASCII）
  0x0022, // quotedbl（就是 ASCII）
  0x0023, // numbersign（就是 ASCII）
  0x0024, // dollar（就是 ASCII）
  0x0025, // percent（就是 ASCII）
  0x0026, // ampersand（就是 ASCII）
  0x2019, // quoteright
  0x0028, // parenleft（就是 ASCII）
  0x0029, // parenright（就是 ASCII）
  0x002A, // asterisk（就是 ASCII）
  0x002B, // plus（就是 ASCII）
  0x002C, // comma（就是 ASCII）
  0x002D, // hyphen（就是 ASCII）
  0x002E, // period（就是 ASCII）
  0x002F, // slash（就是 ASCII）
  0x0030, // zero（就是 ASCII）
  0x0031, // one（就是 ASCII）
  0x0032, // two（就是 ASCII）
  0x0033, // three（就是 ASCII）
  0x0034, // four（就是 ASCII）
  0x0035, // five（就是 ASCII）
  0x0036, // six（就是 ASCII）
  0x0037, // seven（就是 ASCII）
  0x0038, // eight（就是 ASCII）
  0x0039, // nine（就是 ASCII）
  0x003A, // colon（就是 ASCII）
  0x003B, // semicolon（就是 ASCII）
  0x003C, // less（就是 ASCII）
  0x003D, // equal（就是 ASCII）
  0x003E, // greater（就是 ASCII）
  0x003F, // question（就是 ASCII）
  0x0040, // at（就是 ASCII）
  0x0041, // A（就是 ASCII）
  0x0042, // B（就是 ASCII）
  0x0043, // C（就是 ASCII）
  0x0044, // D（就是 ASCII）
  0x0045, // E（就是 ASCII）
  0x0046, // F（就是 ASCII）
  0x0047, // G（就是 ASCII）
  0x0048, // H（就是 ASCII）
  0x0049, // I（就是 ASCII）
  0x004A, // J（就是 ASCII）
  0x004B, // K（就是 ASCII）
  0x004C, // L（就是 ASCII）
  0x004D, // M（就是 ASCII）
  0x004E, // N（就是 ASCII）
  0x004F, // O（就是 ASCII）
  0x0050, // P（就是 ASCII）
  0x0051, // Q（就是 ASCII）
  0x0052, // R（就是 ASCII）
  0x0053, // S（就是 ASCII）
  0x0054, // T（就是 ASCII）
  0x0055, // U（就是 ASCII）
  0x0056, // V（就是 ASCII）
  0x0057, // W（就是 ASCII）
  0x0058, // X（就是 ASCII）
  0x0059, // Y（就是 ASCII）
  0x005A, // Z（就是 ASCII）
  0x005B, // bracketleft（就是 ASCII）
  0x005C, // backslash（就是 ASCII）
  0x005D, // bracketright（就是 ASCII）
  0x005E, // asciicircum（就是 ASCII）
  0x005F, // underscore（就是 ASCII）
  0x2018, // quoteleft
  0x0061, // a（就是 ASCII）
  0x0062, // b（就是 ASCII）
  0x0063, // c（就是 ASCII）
  0x0064, // d（就是 ASCII）
  0x0065, // e（就是 ASCII）
  0x0066, // f（就是 ASCII）
  0x0067, // g（就是 ASCII）
  0x0068, // h（就是 ASCII）
  0x0069, // i（就是 ASCII）
  0x006A, // j（就是 ASCII）
  0x006B, // k（就是 ASCII）
  0x006C, // l（就是 ASCII）
  0x006D, // m（就是 ASCII）
  0x006E, // n（就是 ASCII）
  0x006F, // o（就是 ASCII）
  0x0070, // p（就是 ASCII）
  0x0071, // q（就是 ASCII）
  0x0072, // r（就是 ASCII）
  0x0073, // s（就是 ASCII）
  0x0074, // t（就是 ASCII）
  0x0075, // u（就是 ASCII）
  0x0076, // v（就是 ASCII）
  0x0077, // w（就是 ASCII）
  0x0078, // x（就是 ASCII）
  0x0079, // y（就是 ASCII）
  0x007A, // z（就是 ASCII）
  0x007B, // braceleft（就是 ASCII）
  0x007C, // bar（就是 ASCII）
  0x007D, // braceright（就是 ASCII）
  0x007E, // asciitilde（就是 ASCII）
  0x00A8, // dieresis
]

/**
 * ot1-tt-italic：cmitt10
 * 取自 cmitt10.afm
 */
const ENC_OT1_TT_ITALIC: CodeTable = [
  0x0393, // Gamma
  0x0394, // Delta
  0x0398, // Theta
  0x039B, // Lambda
  0x039E, // Xi
  0x03A0, // Pi
  0x03A3, // Sigma
  0x03A5, // Upsilon
  0x03A6, // Phi
  0x03A8, // Psi
  0x03A9, // Omega
  0x2191, // arrowup
  0x2193, // arrowdown
  0x0027, // quotesingle
  0x00A1, // exclamdown
  0x00BF, // questiondown
  0x0131, // dotlessi
  0x0237, // dotlessj
  0x0060, // grave
  0x00B4, // acute
  0x02C7, // caron
  0x02D8, // breve
  0x00AF, // macron
  0x02DA, // ring
  0x00B8, // cedilla
  0x00DF, // germandbls
  0x00E6, // ae
  0x0153, // oe
  0x00F8, // oslash
  0x00C6, // AE
  0x0152, // OE
  0x00D8, // Oslash
  0x2423, // visiblespace
  0x0021, // exclam（就是 ASCII）
  0x0022, // quotedbl（就是 ASCII）
  0x0023, // numbersign（就是 ASCII）
  0x00A3, // sterling
  0x0025, // percent（就是 ASCII）
  0x0026, // ampersand（就是 ASCII）
  0x2019, // quoteright
  0x0028, // parenleft（就是 ASCII）
  0x0029, // parenright（就是 ASCII）
  0x002A, // asterisk（就是 ASCII）
  0x002B, // plus（就是 ASCII）
  0x002C, // comma（就是 ASCII）
  0x002D, // hyphen（就是 ASCII）
  0x002E, // period（就是 ASCII）
  0x002F, // slash（就是 ASCII）
  0x0030, // zero（就是 ASCII）
  0x0031, // one（就是 ASCII）
  0x0032, // two（就是 ASCII）
  0x0033, // three（就是 ASCII）
  0x0034, // four（就是 ASCII）
  0x0035, // five（就是 ASCII）
  0x0036, // six（就是 ASCII）
  0x0037, // seven（就是 ASCII）
  0x0038, // eight（就是 ASCII）
  0x0039, // nine（就是 ASCII）
  0x003A, // colon（就是 ASCII）
  0x003B, // semicolon（就是 ASCII）
  0x003C, // less（就是 ASCII）
  0x003D, // equal（就是 ASCII）
  0x003E, // greater（就是 ASCII）
  0x003F, // question（就是 ASCII）
  0x0040, // at（就是 ASCII）
  0x0041, // A（就是 ASCII）
  0x0042, // B（就是 ASCII）
  0x0043, // C（就是 ASCII）
  0x0044, // D（就是 ASCII）
  0x0045, // E（就是 ASCII）
  0x0046, // F（就是 ASCII）
  0x0047, // G（就是 ASCII）
  0x0048, // H（就是 ASCII）
  0x0049, // I（就是 ASCII）
  0x004A, // J（就是 ASCII）
  0x004B, // K（就是 ASCII）
  0x004C, // L（就是 ASCII）
  0x004D, // M（就是 ASCII）
  0x004E, // N（就是 ASCII）
  0x004F, // O（就是 ASCII）
  0x0050, // P（就是 ASCII）
  0x0051, // Q（就是 ASCII）
  0x0052, // R（就是 ASCII）
  0x0053, // S（就是 ASCII）
  0x0054, // T（就是 ASCII）
  0x0055, // U（就是 ASCII）
  0x0056, // V（就是 ASCII）
  0x0057, // W（就是 ASCII）
  0x0058, // X（就是 ASCII）
  0x0059, // Y（就是 ASCII）
  0x005A, // Z（就是 ASCII）
  0x005B, // bracketleft（就是 ASCII）
  0x005C, // backslash（就是 ASCII）
  0x005D, // bracketright（就是 ASCII）
  0x005E, // asciicircum（就是 ASCII）
  0x005F, // underscore（就是 ASCII）
  0x2018, // quoteleft
  0x0061, // a（就是 ASCII）
  0x0062, // b（就是 ASCII）
  0x0063, // c（就是 ASCII）
  0x0064, // d（就是 ASCII）
  0x0065, // e（就是 ASCII）
  0x0066, // f（就是 ASCII）
  0x0067, // g（就是 ASCII）
  0x0068, // h（就是 ASCII）
  0x0069, // i（就是 ASCII）
  0x006A, // j（就是 ASCII）
  0x006B, // k（就是 ASCII）
  0x006C, // l（就是 ASCII）
  0x006D, // m（就是 ASCII）
  0x006E, // n（就是 ASCII）
  0x006F, // o（就是 ASCII）
  0x0070, // p（就是 ASCII）
  0x0071, // q（就是 ASCII）
  0x0072, // r（就是 ASCII）
  0x0073, // s（就是 ASCII）
  0x0074, // t（就是 ASCII）
  0x0075, // u（就是 ASCII）
  0x0076, // v（就是 ASCII）
  0x0077, // w（就是 ASCII）
  0x0078, // x（就是 ASCII）
  0x0079, // y（就是 ASCII）
  0x007A, // z（就是 ASCII）
  0x007B, // braceleft（就是 ASCII）
  0x007C, // bar（就是 ASCII）
  0x007D, // braceright（就是 ASCII）
  0x007E, // asciitilde（就是 ASCII）
  0x00A8, // dieresis
]

/**
 * tex：cmtex10 cmtex8 cmtex9
 * 取自 cmtex10.afm
 */
const ENC_TEX: CodeTable = [
  0x22C5, // dotmath
  0x2193, // arrowdown
  0x03B1, // alpha
  0x03B2, // beta
  0x2227, // logicaland
  0x00AC, // logicalnot
  0x2208, // element
  0x03C0, // pi
  0x03BB, // lambda
  0x03B3, // gamma
  0x03B4, // delta
  0x2191, // arrowup
  0x00B1, // plusminus
  0x2295, // circleplus
  0x221E, // infinity
  0x2202, // partialdiff
  0x2282, // propersubset
  0x2283, // propersuperset
  0x2229, // intersection
  0x222A, // union
  0x2200, // universal
  0x2203, // existential
  0x2297, // circlemultiply
  0x2194, // arrowboth
  0x2190, // arrowleft
  0x2192, // arrowright
  0x2260, // notequal
  0x25CA, // lozenge
  0x2264, // lessequal
  0x2265, // greaterequal
  0x2261, // equivalence
  0x2228, // logicalor
  0x0020, // space（就是 ASCII）
  0x0021, // exclam（就是 ASCII）
  0x0022, // quotedbl（就是 ASCII）
  0x0023, // numbersign（就是 ASCII）
  0x0024, // dollar（就是 ASCII）
  0x0025, // percent（就是 ASCII）
  0x0026, // ampersand（就是 ASCII）
  0x2019, // quoteright
  0x0028, // parenleft（就是 ASCII）
  0x0029, // parenright（就是 ASCII）
  0x002A, // asterisk（就是 ASCII）
  0x002B, // plus（就是 ASCII）
  0x002C, // comma（就是 ASCII）
  0x2212, // minus
  0x002E, // period（就是 ASCII）
  0x002F, // slash（就是 ASCII）
  0x0030, // zero（就是 ASCII）
  0x0031, // one（就是 ASCII）
  0x0032, // two（就是 ASCII）
  0x0033, // three（就是 ASCII）
  0x0034, // four（就是 ASCII）
  0x0035, // five（就是 ASCII）
  0x0036, // six（就是 ASCII）
  0x0037, // seven（就是 ASCII）
  0x0038, // eight（就是 ASCII）
  0x0039, // nine（就是 ASCII）
  0x003A, // colon（就是 ASCII）
  0x003B, // semicolon（就是 ASCII）
  0x003C, // less（就是 ASCII）
  0x003D, // equal（就是 ASCII）
  0x003E, // greater（就是 ASCII）
  0x003F, // question（就是 ASCII）
  0x0040, // at（就是 ASCII）
  0x0041, // A（就是 ASCII）
  0x0042, // B（就是 ASCII）
  0x0043, // C（就是 ASCII）
  0x0044, // D（就是 ASCII）
  0x0045, // E（就是 ASCII）
  0x0046, // F（就是 ASCII）
  0x0047, // G（就是 ASCII）
  0x0048, // H（就是 ASCII）
  0x0049, // I（就是 ASCII）
  0x004A, // J（就是 ASCII）
  0x004B, // K（就是 ASCII）
  0x004C, // L（就是 ASCII）
  0x004D, // M（就是 ASCII）
  0x004E, // N（就是 ASCII）
  0x004F, // O（就是 ASCII）
  0x0050, // P（就是 ASCII）
  0x0051, // Q（就是 ASCII）
  0x0052, // R（就是 ASCII）
  0x0053, // S（就是 ASCII）
  0x0054, // T（就是 ASCII）
  0x0055, // U（就是 ASCII）
  0x0056, // V（就是 ASCII）
  0x0057, // W（就是 ASCII）
  0x0058, // X（就是 ASCII）
  0x0059, // Y（就是 ASCII）
  0x005A, // Z（就是 ASCII）
  0x005B, // bracketleft（就是 ASCII）
  0x005C, // backslash（就是 ASCII）
  0x005D, // bracketright（就是 ASCII）
  0x005E, // asciicircum（就是 ASCII）
  0x005F, // underscore（就是 ASCII）
  0x2018, // quoteleft
  0x0061, // a（就是 ASCII）
  0x0062, // b（就是 ASCII）
  0x0063, // c（就是 ASCII）
  0x0064, // d（就是 ASCII）
  0x0065, // e（就是 ASCII）
  0x0066, // f（就是 ASCII）
  0x0067, // g（就是 ASCII）
  0x0068, // h（就是 ASCII）
  0x0069, // i（就是 ASCII）
  0x006A, // j（就是 ASCII）
  0x006B, // k（就是 ASCII）
  0x006C, // l（就是 ASCII）
  0x006D, // m（就是 ASCII）
  0x006E, // n（就是 ASCII）
  0x006F, // o（就是 ASCII）
  0x0070, // p（就是 ASCII）
  0x0071, // q（就是 ASCII）
  0x0072, // r（就是 ASCII）
  0x0073, // s（就是 ASCII）
  0x0074, // t（就是 ASCII）
  0x0075, // u（就是 ASCII）
  0x0076, // v（就是 ASCII）
  0x0077, // w（就是 ASCII）
  0x0078, // x（就是 ASCII）
  0x0079, // y（就是 ASCII）
  0x007A, // z（就是 ASCII）
  0x007B, // braceleft（就是 ASCII）
  0x007C, // bar（就是 ASCII）
  0x007D, // braceright（就是 ASCII）
  0x007E, // asciitilde（就是 ASCII）
  0x222B, // integral
]

/**
 * cmmi：cmmi10 cmmi12 cmmi5 cmmi6 cmmi7 cmmi8 cmmi9 cmmib10
 * 取自 cmmi10.afm
 */
const ENC_CMMI: CodeTable = [
  0x0393, // Gamma
  0x0394, // Delta
  0x0398, // Theta
  0x039B, // Lambda
  0x039E, // Xi
  0x03A0, // Pi
  0x03A3, // Sigma
  0x03A5, // Upsilon
  0x03A6, // Phi
  0x03A8, // Psi
  0x03A9, // Omega
  0x03B1, // alpha
  0x03B2, // beta
  0x03B3, // gamma
  0x03B4, // delta
  0x03F5, // epsilon1
  0x03B6, // zeta
  0x03B7, // eta
  0x03B8, // theta
  0x03B9, // iota
  0x03BA, // kappa
  0x03BB, // lambda
  0x03BC, // mu
  0x03BD, // nu
  0x03BE, // xi
  0x03C0, // pi
  0x03C1, // rho
  0x03C3, // sigma
  0x03C4, // tau
  0x03C5, // upsilon
  0x03C6, // phi
  0x03C7, // chi
  0x03C8, // psi
  0x03C9, // omega
  0x03B5, // epsilon
  0x03D1, // theta1
  0x03D6, // pi1
  0x03F1, // rho1
  0x03C2, // sigma1
  0x03D5, // phi1
  0x21BC, // arrowlefttophalf
  0x21BD, // arrowleftbothalf
  0x21C0, // arrowrighttophalf
  0x21C1, // arrowrightbothalf
  0x21A9, // arrowhookleft
  0x21AA, // arrowhookright
  0x25B7, // triangleright
  0x25C1, // triangleleft
  0x0030, // zerooldstyle（就是 ASCII）
  0x0031, // oneoldstyle（就是 ASCII）
  0x0032, // twooldstyle（就是 ASCII）
  0x0033, // threeoldstyle（就是 ASCII）
  0x0034, // fouroldstyle（就是 ASCII）
  0x0035, // fiveoldstyle（就是 ASCII）
  0x0036, // sixoldstyle（就是 ASCII）
  0x0037, // sevenoldstyle（就是 ASCII）
  0x0038, // eightoldstyle（就是 ASCII）
  0x0039, // nineoldstyle（就是 ASCII）
  0x002E, // period
  0x002C, // comma
  0x003C, // less（就是 ASCII）
  0x002F, // slash
  0x003E, // greater（就是 ASCII）
  0x22C6, // star
  0x2202, // partialdiff
  0x0041, // A（就是 ASCII）
  0x0042, // B（就是 ASCII）
  0x0043, // C（就是 ASCII）
  0x0044, // D（就是 ASCII）
  0x0045, // E（就是 ASCII）
  0x0046, // F（就是 ASCII）
  0x0047, // G（就是 ASCII）
  0x0048, // H（就是 ASCII）
  0x0049, // I（就是 ASCII）
  0x004A, // J（就是 ASCII）
  0x004B, // K（就是 ASCII）
  0x004C, // L（就是 ASCII）
  0x004D, // M（就是 ASCII）
  0x004E, // N（就是 ASCII）
  0x004F, // O（就是 ASCII）
  0x0050, // P（就是 ASCII）
  0x0051, // Q（就是 ASCII）
  0x0052, // R（就是 ASCII）
  0x0053, // S（就是 ASCII）
  0x0054, // T（就是 ASCII）
  0x0055, // U（就是 ASCII）
  0x0056, // V（就是 ASCII）
  0x0057, // W（就是 ASCII）
  0x0058, // X（就是 ASCII）
  0x0059, // Y（就是 ASCII）
  0x005A, // Z（就是 ASCII）
  0x266D, // flat
  0x266E, // natural
  0x266F, // sharp
  0x2323, // slurbelow
  0x2322, // slurabove
  0x2113, // lscript
  0x0061, // a（就是 ASCII）
  0x0062, // b（就是 ASCII）
  0x0063, // c（就是 ASCII）
  0x0064, // d（就是 ASCII）
  0x0065, // e（就是 ASCII）
  0x0066, // f（就是 ASCII）
  0x0067, // g（就是 ASCII）
  0x0068, // h（就是 ASCII）
  0x0069, // i（就是 ASCII）
  0x006A, // j（就是 ASCII）
  0x006B, // k（就是 ASCII）
  0x006C, // l（就是 ASCII）
  0x006D, // m（就是 ASCII）
  0x006E, // n（就是 ASCII）
  0x006F, // o（就是 ASCII）
  0x0070, // p（就是 ASCII）
  0x0071, // q（就是 ASCII）
  0x0072, // r（就是 ASCII）
  0x0073, // s（就是 ASCII）
  0x0074, // t（就是 ASCII）
  0x0075, // u（就是 ASCII）
  0x0076, // v（就是 ASCII）
  0x0077, // w（就是 ASCII）
  0x0078, // x（就是 ASCII）
  0x0079, // y（就是 ASCII）
  0x007A, // z（就是 ASCII）
  0x0131, // dotlessi
  0x0237, // dotlessj
  0x2118, // weierstrass
  0x2192, // vector
  0x2040, // tie
]

/**
 * cmsy：cmbsy10 cmsy10 cmsy5 cmsy6 cmsy7 cmsy8 cmsy9
 * 取自 cmsy10.afm
 */
const ENC_CMSY: CodeTable = [
  0x2212, // minus
  0x22C5, // periodcentered
  0x00D7, // multiply
  0x2217, // asteriskmath
  0x00F7, // divide
  0x22C4, // diamondmath
  0x00B1, // plusminus
  0x2213, // minusplus
  0x2295, // circleplus
  0x2296, // circleminus
  0x2297, // circlemultiply
  0x2298, // circledivide
  0x2299, // circledot
  0x25CB, // circlecopyrt
  0x2218, // openbullet
  0x2022, // bullet
  0x224D, // equivasymptotic
  0x2261, // equivalence
  0x2286, // reflexsubset
  0x2287, // reflexsuperset
  0x2264, // lessequal
  0x2265, // greaterequal
  0x2AAF, // precedesequal
  0x2AB0, // followsequal
  0x223C, // similar
  0x2248, // approxequal
  0x2282, // propersubset
  0x2283, // propersuperset
  0x226A, // lessmuch
  0x226B, // greatermuch
  0x227A, // precedes
  0x227B, // follows
  0x2190, // arrowleft
  0x2192, // arrowright
  0x2191, // arrowup
  0x2193, // arrowdown
  0x2194, // arrowboth
  0x2197, // arrownortheast
  0x2198, // arrowsoutheast
  0x2243, // similarequal
  0x21D0, // arrowdblleft
  0x21D2, // arrowdblright
  0x21D1, // arrowdblup
  0x21D3, // arrowdbldown
  0x21D4, // arrowdblboth
  0x2196, // arrownorthwest
  0x2199, // arrowsouthwest
  0x221D, // proportional
  0x2032, // prime
  0x221E, // infinity
  0x2208, // element
  0x220B, // owner
  0x25B3, // triangle
  0x25BD, // triangleinv
  0x0338, // negationslash
  0x21A6, // mapsto
  0x2200, // universal
  0x2203, // existential
  0x00AC, // logicalnot
  0x2205, // emptyset
  0x211C, // Rfractur
  0x2111, // Ifractur
  0x22A4, // latticetop
  0x22A5, // perpendicular
  0x2135, // aleph
  0x0041, // A（就是 ASCII）
  0x0042, // B（就是 ASCII）
  0x0043, // C（就是 ASCII）
  0x0044, // D（就是 ASCII）
  0x0045, // E（就是 ASCII）
  0x0046, // F（就是 ASCII）
  0x0047, // G（就是 ASCII）
  0x0048, // H（就是 ASCII）
  0x0049, // I（就是 ASCII）
  0x004A, // J（就是 ASCII）
  0x004B, // K（就是 ASCII）
  0x004C, // L（就是 ASCII）
  0x004D, // M（就是 ASCII）
  0x004E, // N（就是 ASCII）
  0x004F, // O（就是 ASCII）
  0x0050, // P（就是 ASCII）
  0x0051, // Q（就是 ASCII）
  0x0052, // R（就是 ASCII）
  0x0053, // S（就是 ASCII）
  0x0054, // T（就是 ASCII）
  0x0055, // U（就是 ASCII）
  0x0056, // V（就是 ASCII）
  0x0057, // W（就是 ASCII）
  0x0058, // X（就是 ASCII）
  0x0059, // Y（就是 ASCII）
  0x005A, // Z（就是 ASCII）
  0x222A, // union
  0x2229, // intersection
  0x228E, // unionmulti
  0x2227, // logicaland
  0x2228, // logicalor
  0x22A2, // turnstileleft
  0x22A3, // turnstileright
  0x230A, // floorleft
  0x230B, // floorright
  0x2308, // ceilingleft
  0x2309, // ceilingright
  0x007B, // braceleft
  0x007D, // braceright
  0x27E8, // angbracketleft
  0x27E9, // angbracketright
  0x2223, // bar
  0x2225, // bardbl
  0x2195, // arrowbothv
  0x21D5, // arrowdblbothv
  0x2216, // backslash
  0x2240, // wreathproduct
  0x221A, // radical
  0x2A3F, // coproduct
  0x2207, // nabla
  0x222B, // integral
  0x2294, // unionsq
  0x2293, // intersectionsq
  0x2291, // subsetsqequal
  0x2292, // supersetsqequal
  0x00A7, // section
  0x2020, // dagger
  0x2021, // daggerdbl
  0x00B6, // paragraph
  0x2663, // club
  0x2662, // diamond
  0x2661, // heart
  0x2660, // spade
]

/**
 * cmex：cmex10
 * 取自 cmex10.afm
 */
const ENC_CMEX: CodeTable = [
  0xE043, // parenleftbig：Unicode 里没有身份，用私用区保留位
  0xE047, // parenrightbig：Unicode 里没有身份，用私用区保留位
  0xE01F, // bracketleftbig：Unicode 里没有身份，用私用区保留位
  0xE023, // bracketrightbig：Unicode 里没有身份，用私用区保留位
  0xE034, // floorleftbig：Unicode 里没有身份，用私用区保留位
  0xE038, // floorrightbig：Unicode 里没有身份，用私用区保留位
  0xE027, // ceilingleftbig：Unicode 里没有身份，用私用区保留位
  0xE02B, // ceilingrightbig：Unicode 里没有身份，用私用区保留位
  0xE017, // braceleftbig：Unicode 里没有身份，用私用区保留位
  0xE01B, // bracerightbig：Unicode 里没有身份，用私用区保留位
  0xE002, // angbracketleftbig：Unicode 里没有身份，用私用区保留位
  0xE006, // angbracketrightbig：Unicode 里没有身份，用私用区保留位
  0xE05E, // vextendsingle：Unicode 里没有身份，用私用区保留位
  0xE05D, // vextenddouble：Unicode 里没有身份，用私用区保留位
  0xE053, // slashbig：Unicode 里没有身份，用私用区保留位
  0xE00F, // backslashbig：Unicode 里没有身份，用私用区保留位
  0xE041, // parenleftBig：Unicode 里没有身份，用私用区保留位
  0xE045, // parenrightBig：Unicode 里没有身份，用私用区保留位
  0xE044, // parenleftbigg：Unicode 里没有身份，用私用区保留位
  0xE048, // parenrightbigg：Unicode 里没有身份，用私用区保留位
  0xE020, // bracketleftbigg：Unicode 里没有身份，用私用区保留位
  0xE024, // bracketrightbigg：Unicode 里没有身份，用私用区保留位
  0xE035, // floorleftbigg：Unicode 里没有身份，用私用区保留位
  0xE039, // floorrightbigg：Unicode 里没有身份，用私用区保留位
  0xE028, // ceilingleftbigg：Unicode 里没有身份，用私用区保留位
  0xE02C, // ceilingrightbigg：Unicode 里没有身份，用私用区保留位
  0xE018, // braceleftbigg：Unicode 里没有身份，用私用区保留位
  0xE01C, // bracerightbigg：Unicode 里没有身份，用私用区保留位
  0xE003, // angbracketleftbigg：Unicode 里没有身份，用私用区保留位
  0xE007, // angbracketrightbigg：Unicode 里没有身份，用私用区保留位
  0xE054, // slashbigg：Unicode 里没有身份，用私用区保留位
  0xE010, // backslashbigg：Unicode 里没有身份，用私用区保留位
  0xE042, // parenleftBigg：Unicode 里没有身份，用私用区保留位
  0xE046, // parenrightBigg：Unicode 里没有身份，用私用区保留位
  0xE01E, // bracketleftBigg：Unicode 里没有身份，用私用区保留位
  0xE022, // bracketrightBigg：Unicode 里没有身份，用私用区保留位
  0xE033, // floorleftBigg：Unicode 里没有身份，用私用区保留位
  0xE037, // floorrightBigg：Unicode 里没有身份，用私用区保留位
  0xE026, // ceilingleftBigg：Unicode 里没有身份，用私用区保留位
  0xE02A, // ceilingrightBigg：Unicode 里没有身份，用私用区保留位
  0xE016, // braceleftBigg：Unicode 里没有身份，用私用区保留位
  0xE01A, // bracerightBigg：Unicode 里没有身份，用私用区保留位
  0xE001, // angbracketleftBigg：Unicode 里没有身份，用私用区保留位
  0xE005, // angbracketrightBigg：Unicode 里没有身份，用私用区保留位
  0xE052, // slashBigg：Unicode 里没有身份，用私用区保留位
  0xE00E, // backslashBigg：Unicode 里没有身份，用私用区保留位
  0xE051, // slashBig：Unicode 里没有身份，用私用区保留位
  0xE00D, // backslashBig：Unicode 里没有身份，用私用区保留位
  0x239B, // parenlefttp
  0x239E, // parenrighttp
  0x23A1, // bracketlefttp
  0x23A4, // bracketrighttp
  0x23A3, // bracketleftbt
  0x23A6, // bracketrightbt
  0x23A2, // bracketleftex
  0x23A5, // bracketrightex
  0x23A7, // bracelefttp
  0x23AB, // bracerighttp
  0x23A9, // braceleftbt
  0x23AD, // bracerightbt
  0x23A8, // braceleftmid
  0x23AC, // bracerightmid
  0x23AA, // braceex
  0x23D0, // arrowvertex
  0x239D, // parenleftbt
  0x23A0, // parenrightbt
  0x239C, // parenleftex
  0x239F, // parenrightex
  0xE000, // angbracketleftBig：Unicode 里没有身份，用私用区保留位
  0xE004, // angbracketrightBig：Unicode 里没有身份，用私用区保留位
  0x2A06, // unionsqtext
  0xE05C, // unionsqdisplay：Unicode 里没有身份，用私用区保留位
  0x222E, // contintegraltext
  0xE030, // contintegraldisplay：Unicode 里没有身份，用私用区保留位
  0x2A00, // circledottext
  0xE02D, // circledotdisplay：Unicode 里没有身份，用私用区保留位
  0x2A01, // circleplustext
  0xE02F, // circleplusdisplay：Unicode 里没有身份，用私用区保留位
  0x2A02, // circlemultiplytext
  0xE02E, // circlemultiplydisplay：Unicode 里没有身份，用私用区保留位
  0x2211, // summationtext
  0x220F, // producttext
  0x222B, // integraltext
  0x22C3, // uniontext
  0x22C2, // intersectiontext
  0x2A04, // unionmultitext
  0x22C0, // logicalandtext
  0x22C1, // logicalortext
  0xE055, // summationdisplay：Unicode 里没有身份，用私用区保留位
  0xE049, // productdisplay：Unicode 里没有身份，用私用区保留位
  0xE03D, // integraldisplay：Unicode 里没有身份，用私用区保留位
  0xE05A, // uniondisplay：Unicode 里没有身份，用私用区保留位
  0xE03E, // intersectiondisplay：Unicode 里没有身份，用私用区保留位
  0xE05B, // unionmultidisplay：Unicode 里没有身份，用私用区保留位
  0xE03F, // logicalanddisplay：Unicode 里没有身份，用私用区保留位
  0xE040, // logicalordisplay：Unicode 里没有身份，用私用区保留位
  0x2210, // coproducttext
  0xE031, // coproductdisplay：Unicode 里没有身份，用私用区保留位
  0xE03A, // hatwide：Unicode 里没有身份，用私用区保留位
  0xE03B, // hatwider：Unicode 里没有身份，用私用区保留位
  0xE03C, // hatwidest：Unicode 里没有身份，用私用区保留位
  0xE057, // tildewide：Unicode 里没有身份，用私用区保留位
  0xE058, // tildewider：Unicode 里没有身份，用私用区保留位
  0xE059, // tildewidest：Unicode 里没有身份，用私用区保留位
  0xE01D, // bracketleftBig：Unicode 里没有身份，用私用区保留位
  0xE021, // bracketrightBig：Unicode 里没有身份，用私用区保留位
  0xE032, // floorleftBig：Unicode 里没有身份，用私用区保留位
  0xE036, // floorrightBig：Unicode 里没有身份，用私用区保留位
  0xE025, // ceilingleftBig：Unicode 里没有身份，用私用区保留位
  0xE029, // ceilingrightBig：Unicode 里没有身份，用私用区保留位
  0xE015, // braceleftBig：Unicode 里没有身份，用私用区保留位
  0xE019, // bracerightBig：Unicode 里没有身份，用私用区保留位
  0xE04C, // radicalbig：Unicode 里没有身份，用私用区保留位
  0xE04A, // radicalBig：Unicode 里没有身份，用私用区保留位
  0xE04D, // radicalbigg：Unicode 里没有身份，用私用区保留位
  0xE04B, // radicalBigg：Unicode 里没有身份，用私用区保留位
  0xE04E, // radicalbt：Unicode 里没有身份，用私用区保留位
  0xE050, // radicalvertex：Unicode 里没有身份，用私用区保留位
  0xE04F, // radicaltp：Unicode 里没有身份，用私用区保留位
  0xE00C, // arrowvertexdbl：Unicode 里没有身份，用私用区保留位
  0xE00B, // arrowtp：Unicode 里没有身份，用私用区保留位
  0xE008, // arrowbt：Unicode 里没有身份，用私用区保留位
  0xE011, // bracehtipdownleft：Unicode 里没有身份，用私用区保留位
  0xE012, // bracehtipdownright：Unicode 里没有身份，用私用区保留位
  0xE013, // bracehtipupleft：Unicode 里没有身份，用私用区保留位
  0xE014, // bracehtipupright：Unicode 里没有身份，用私用区保留位
  0xE00A, // arrowdbltp：Unicode 里没有身份，用私用区保留位
  0xE009, // arrowdblbt：Unicode 里没有身份，用私用区保留位
]

/**
 * inch：cminch
 * 取自 cminch.afm
 */
const ENC_INCH: CodeTable = [
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  0x0020, // space（就是 ASCII）
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  0x002D, // hyphen（就是 ASCII）
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  0x0030, // zero（就是 ASCII）
  0x0031, // one（就是 ASCII）
  0x0032, // two（就是 ASCII）
  0x0033, // three（就是 ASCII）
  0x0034, // four（就是 ASCII）
  0x0035, // five（就是 ASCII）
  0x0036, // six（就是 ASCII）
  0x0037, // seven（就是 ASCII）
  0x0038, // eight（就是 ASCII）
  0x0039, // nine（就是 ASCII）
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  0x0041, // A（就是 ASCII）
  0x0042, // B（就是 ASCII）
  0x0043, // C（就是 ASCII）
  0x0044, // D（就是 ASCII）
  0x0045, // E（就是 ASCII）
  0x0046, // F（就是 ASCII）
  0x0047, // G（就是 ASCII）
  0x0048, // H（就是 ASCII）
  0x0049, // I（就是 ASCII）
  0x004A, // J（就是 ASCII）
  0x004B, // K（就是 ASCII）
  0x004C, // L（就是 ASCII）
  0x004D, // M（就是 ASCII）
  0x004E, // N（就是 ASCII）
  0x004F, // O（就是 ASCII）
  0x0050, // P（就是 ASCII）
  0x0051, // Q（就是 ASCII）
  0x0052, // R（就是 ASCII）
  0x0053, // S（就是 ASCII）
  0x0054, // T（就是 ASCII）
  0x0055, // U（就是 ASCII）
  0x0056, // V（就是 ASCII）
  0x0057, // W（就是 ASCII）
  0x0058, // X（就是 ASCII）
  0x0059, // Y（就是 ASCII）
  0x005A, // Z（就是 ASCII）
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
  null, // 该字体在这个码位上没有字形
]

/** 族名 → 码表 */
export const TABLES: Record<string, CodeTable> = {
  'ot1': ENC_OT1,
  'ot1-italic': ENC_OT1_ITALIC,
  'ot1-nolig': ENC_OT1_NOLIG,
  'ot1-tt': ENC_OT1_TT,
  'ot1-tt-italic': ENC_OT1_TT_ITALIC,
  'tex': ENC_TEX,
  'cmmi': ENC_CMMI,
  'cmsy': ENC_CMSY,
  'cmex': ENC_CMEX,
  'inch': ENC_INCH,
}

/** DVI 字体名 → 族名（由 AFM 的分族直接给出，75 个字体全覆盖） */
export const FONT_TABLE: Record<string, string> = {
  'cmb10': 'ot1',
  'cmbsy10': 'cmsy',
  'cmbx10': 'ot1',
  'cmbx12': 'ot1',
  'cmbx5': 'ot1',
  'cmbx6': 'ot1',
  'cmbx7': 'ot1',
  'cmbx8': 'ot1',
  'cmbx9': 'ot1',
  'cmbxsl10': 'ot1',
  'cmbxti10': 'ot1-italic',
  'cmcsc10': 'ot1-nolig',
  'cmdunh10': 'ot1',
  'cmex10': 'cmex',
  'cmff10': 'ot1-italic',
  'cmfi10': 'ot1-italic',
  'cmfib8': 'ot1-italic',
  'cminch': 'inch',
  'cmitt10': 'ot1-tt-italic',
  'cmmi10': 'cmmi',
  'cmmi12': 'cmmi',
  'cmmi5': 'cmmi',
  'cmmi6': 'cmmi',
  'cmmi7': 'cmmi',
  'cmmi8': 'cmmi',
  'cmmi9': 'cmmi',
  'cmmib10': 'cmmi',
  'cmr10': 'ot1',
  'cmr12': 'ot1',
  'cmr17': 'ot1',
  'cmr5': 'ot1-nolig',
  'cmr6': 'ot1',
  'cmr7': 'ot1',
  'cmr8': 'ot1',
  'cmr9': 'ot1',
  'cmsl10': 'ot1',
  'cmsl12': 'ot1',
  'cmsl8': 'ot1',
  'cmsl9': 'ot1',
  'cmsltt10': 'ot1-tt',
  'cmss10': 'ot1',
  'cmss12': 'ot1',
  'cmss17': 'ot1',
  'cmss8': 'ot1',
  'cmss9': 'ot1',
  'cmssbx10': 'ot1',
  'cmssdc10': 'ot1',
  'cmssi10': 'ot1',
  'cmssi12': 'ot1',
  'cmssi17': 'ot1',
  'cmssi8': 'ot1',
  'cmssi9': 'ot1',
  'cmssq8': 'ot1',
  'cmssqi8': 'ot1',
  'cmsy10': 'cmsy',
  'cmsy5': 'cmsy',
  'cmsy6': 'cmsy',
  'cmsy7': 'cmsy',
  'cmsy8': 'cmsy',
  'cmsy9': 'cmsy',
  'cmtcsc10': 'ot1-tt',
  'cmtex10': 'tex',
  'cmtex8': 'tex',
  'cmtex9': 'tex',
  'cmti10': 'ot1-italic',
  'cmti12': 'ot1-italic',
  'cmti7': 'ot1-italic',
  'cmti8': 'ot1-italic',
  'cmti9': 'ot1-italic',
  'cmtt10': 'ot1-tt',
  'cmtt12': 'ot1-tt',
  'cmtt8': 'ot1-tt',
  'cmtt9': 'ot1-tt',
  'cmu10': 'ot1-italic',
  'cmvtt10': 'ot1',
}
