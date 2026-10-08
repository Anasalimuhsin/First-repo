// Detection lexicon. Terms are written naturally and normalized at load time,
// so variants such as "انتحر" / "إنتحر" match the same rule.
//
// Each term:
//   ar / en / az  string or array of variants (az = Arabizi, e.g. "ra7 ant7er")
//   weight        contribution to the category score (0..1). A category alerts
//                 once its score reaches the threshold in ruleEngine.js.
//   severity      the minimum severity an alert gets when this term matches.
//
// Dialects covered: Gulf, Levantine, Egyptian, Iraqi and some Maghrebi forms.
// Every change must be measured with `npm run eval` and reviewed by
// child-safety specialists and native speakers of each dialect.

export const SEVERITIES = ['low', 'medium', 'high', 'critical'];

export const CATEGORIES = {
  self_harm: {
    labelAr: 'إيذاء النفس / أفكار انتحارية',
    // A match immediately followed by one of these is an idiom, not a signal:
    // "ابي اموت من الضحك" (dying of laughter), "suicide prevention".
    notFollowedBy: ['من الضحك', 'من الفرحه', 'من الحماس', 'من الجوع', 'من الحر', 'فيك', 'فيج', 'فيه',
                    'mn el da7k', 'mn eld7k', 'men el da7k', 'of laughter', 'prevention', 'awareness', 'hotline'],
    parentGuidanceAr:
      'تحدّث مع طفلك بهدوء ودون لوم، واستمع أكثر مما تتكلم. اسأله مباشرةً إن كان يفكر في إيذاء نفسه، فالسؤال لا يزرع الفكرة. إذا كان هناك خطر فوري تواصل مع خدمات الطوارئ أو خط دعم نفسي محلي.',
    terms: [
      {
        ar: ['ابي اموت', 'ابغى اموت', 'ودي اموت', 'اريد ان اموت', 'اريد اموت', 'بدي موت', 'بدي اموت',
             'نفسي اموت', 'عايز اموت', 'عاوز اموت', 'عايزه اموت', 'نبغي نموت', 'حاب اموت'],
        en: ['i want to die', 'i wanna die', 'want to be dead'],
        az: ['abi amoot', 'abgha amoot', 'bdi moot', 'bade mot', '3ayez amoot', '3ayza amoot', 'nefsy amoot'],
        weight: 1, severity: 'critical',
      },
      {
        ar: ['راح انتحر', 'رح انتحر', 'بنتحر', 'هنتحر', 'حانتحر', 'بقتل نفسي', 'هقتل نفسي', 'راح اقتل نفسي',
             'ابي اقتل نفسي', 'بدي اقتل حالي', 'افكر في الانتحار', 'افكر انتحر', 'ابي انتحر', 'بدي انتحر'],
        en: ['kill myself', 'end my life', 'take my own life', 'going to end it all'],
        az: ['ra7 ant7er', 'badi ant7er', 'han7er nafsy', 'ba2tol nafsi', 'abi ant7er'],
        weight: 1, severity: 'critical',
      },
      { ar: ['اقطع شرايني', 'اقطع عروقي'], en: ['slit my wrists'], weight: 1, severity: 'critical' },
      { ar: 'انتحار', en: ['suicide', 'suicidal'], weight: 0.5, severity: 'high' },
      { ar: ['انتحر', 'انتحرت'], en: ['kms'], weight: 0.6, severity: 'high' },
      { ar: ['اجرح نفسي', 'اجرح يدي', 'جرحت نفسي', 'اجرح حالي'], en: ['cut myself', 'cutting myself', 'self harm'], weight: 0.9, severity: 'high' },
      { ar: ['اذي نفسي', 'اذيت نفسي', 'اذي حالي'], en: ['hurt myself'], weight: 0.8, severity: 'high' },
      {
        ar: ['ما في فايده من حياتي', 'ما في داعي اعيش', 'ما ابي اعيش', 'مابي اعيش', 'مش عايز اعيش', 'ما بدي عيش', 'ما بدي اعيش'],
        en: ['no reason to live', "don't want to live", 'dont want to live'],
        az: ['mesh 3ayez a3eesh', 'ma bdi 3eesh'],
        weight: 0.8, severity: 'high',
      },
      { ar: ['الكل احسن بدوني', 'الكل بيرتاح مني', 'ارتاحوا مني'], en: ['better off without me'], weight: 0.8, severity: 'high' },
      { ar: ['هذي اخر رساله مني', 'هذه اخر رساله'], en: ['this is my last message', 'goodbye forever'], weight: 0.7, severity: 'high' },
      { ar: ['كيف اموت', 'كيف انتحر', 'طريقه انتحار', 'كيف اقتل نفسي'], en: ['how to kill myself', 'how do i die', 'painless way to die'], weight: 1, severity: 'critical' },
      // Passive ideation — well-documented phrasings.
      { ar: ['انام وما اصحى', 'انام وما اقوم', 'نام وما فيق', 'ياليتني ما انولدت', 'ياليتني ميت'], en: ['sleep and never wake up', "wish i wasn't born", 'wish i was dead', "don't want to be here anymore", 'dont want to be here anymore'], weight: 0.8, severity: 'high' },
      { ar: ['محد بيفقدني', 'ما احد راح يفتقدني', 'محد راح يفتقدني', 'محدش هيفتقدني'], en: ['no one would miss me', 'nobody would miss me', 'nobody would care if i'], weight: 0.7, severity: 'high' },
      { ar: ['تعبت من الحياه', 'كرهت حياتي', 'ما عاد اتحمل'], en: ['hate my life', "can't take it anymore"], weight: 0.35, severity: 'medium' },
    ],
  },

  bullying: {
    labelAr: 'تنمّر إلكتروني',
    parentGuidanceAr:
      'اطمئن على شعور طفلك أولاً، واحتفظ بالأدلة (لقطات شاشة)، ولا تردّ على المتنمر نيابةً عنه. استخدم أدوات الحظر والإبلاغ في التطبيق، وتواصل مع المدرسة إذا كان المتنمر زميلاً.',
    terms: [
      { ar: ['محد يحبك', 'ما حد بيحبك', 'محد يبيك', 'ما احد يبيك', 'ماحد يطيقك', 'محدش بيحبك'], en: ['nobody likes you', 'no one likes you', 'nobody wants you'], az: ['m7d y7bk', 'mo7ad y7bk', 'ma7adesh bey7ebak'], weight: 0.6, severity: 'medium' },
      { ar: ['روح موت', 'روحي موتي', 'موت احسن لك', 'موتي احسن لك', 'ياريتك تموت', 'ياريت تموتي'], en: ['go die', 'you should die', 'hope you die'], az: ['roo7 moot', 'ro7 mot', 'ro7i moti'], weight: 0.9, severity: 'high' },
      { ar: ['اقتل حالك', 'اقتل نفسك', 'انتحر احسن لك', 'روح انتحر'], en: ['kill yourself', 'kys', 'go kill yourself'], weight: 1, severity: 'high' },
      { ar: ['انت فاشل', 'انتي فاشله', 'يا فاشل', 'يا فاشله', 'انت ولا شي', 'انتي ولا شي'], en: ['you are a loser', "you're a loser", 'you are nothing'], weight: 0.4, severity: 'medium' },
      { ar: ['يا غبي', 'يا غبيه', 'يا حمار', 'يا حماره', 'يا كلب', 'يا حيوان'], en: ['you are stupid', "you're stupid", 'you idiot'], weight: 0.3, severity: 'low' },
      { ar: ['شكلك يقرف', 'شكلك مقرف', 'انت قبيح', 'انتي قبيحه', 'يا سمين', 'يا سمينه', 'يا دب'], en: ['you are ugly', "you're ugly", 'fat pig'], weight: 0.5, severity: 'medium' },
      { ar: ['كلنا نكرهك', 'الكل يكرهك', 'الكل يضحك عليك', 'كل المدرسه تضحك عليك'], en: ['everyone hates you', 'everybody hates you', 'everyone laughs at you'], az: ['kolna nkrhk'], weight: 0.7, severity: 'medium' },
      { ar: ['بفضحك', 'راح افضحك', 'هفضحك', 'بننشر فضيحتك'], en: ['i will expose you', "i'll expose you"], weight: 0.6, severity: 'medium' },
      { ar: ['بنشر صورك', 'راح انشر صورك', 'هنشر صورك', 'بنزل صورك'], en: ['post your pics', 'leak your pics', 'leak your nudes'], weight: 0.8, severity: 'high' },
      // Exclusion: two separate terms so "kick her out" + "nobody talk to her" add up.
      { ar: ['طلعوه من القروب', 'طلعوها من القروب', 'حظروه كلكم', 'حظروها كلكم'], en: ['kick him out of the group', 'kick her out of the group', 'everyone block'], weight: 0.4, severity: 'medium' },
      { ar: ['لا احد يكلمه', 'لا احد يكلمها', 'محد يكلمه', 'محد يكلمها', 'محد يبي يلعب معك', 'محد يبي يجلس معك'], en: ['nobody talk to him', 'nobody talk to her', 'no one wants to sit with you'], weight: 0.4, severity: 'medium' },
    ],
  },

  grooming: {
    labelAr: 'استدراج / تحرّش',
    parentGuidanceAr:
      'لا تواجه الشخص الآخر مباشرة ولا تحذف المحادثة. احتفظ بالأدلة وأبلغ المنصة والجهات المختصة (الشرطة أو خط حماية الطفل). طمئن طفلك أنه ليس مخطئاً وأنه فعل الصواب.',
    terms: [
      { ar: ['لا تقول لاهلك', 'لا تقولي لاهلك', 'لا تقول لامك', 'لا تقولي لامك', 'لا تخبر امك', 'لا تخبري امك', 'لا تعلم اهلك', 'متقوليش لماما'], en: ["don't tell your parents", 'dont tell your parents', "don't tell your mom", "don't tell your mum"], az: ['la t2ol l ahlk', 'mat2olesh l mama'], weight: 0.7, severity: 'high' },
      { ar: ['خليها سر بيننا', 'سرنا الصغير'], en: ['our little secret'], weight: 0.7, severity: 'high' },
      // Common in innocent chat too; only meaningful combined with other signals.
      { ar: ['خلينا سر', 'سر بيني وبينك'], en: ['between you and me', 'keep it secret'], weight: 0.35, severity: 'medium' },
      { ar: ['احذف المحادثه', 'احذفي المحادثه', 'امسح الرسائل', 'امسحي الرسايل', 'امسحي المحادثه'], en: ['delete this chat', 'delete our messages', 'delete the messages'], weight: 0.5, severity: 'medium' },
      { ar: ['ارسل صورتك', 'ارسلي صورتك', 'ارسلي صوره', 'صوريلي', 'ابعتلي صورتك', 'ابعتيلي صوره', 'دزيلي صوره'], en: ['send me a pic', 'send me a photo', 'send pics', 'send a selfie'], az: ['ab3atly sortk', 'ersli sora', 'ersly sorah'], weight: 0.4, severity: 'medium' },
      { ar: ['صوره بدون ملابس', 'صوره عاريه', 'وريني جسمك', 'ورني جسمك', 'شيلي ملابسك'], en: ['send nudes', 'show me your body', 'take off your clothes'], weight: 1, severity: 'critical' },
      { ar: ['افتحي الكاميرا', 'افتح الكاميرا', 'شغلي الكام', 'كاميرا خاصه'], en: ['turn on your camera', 'turn your cam on', 'private video call'], weight: 0.4, severity: 'medium' },
      { ar: ['كم عمرك', 'قديش عمرك', 'عمرك كام', 'انت بأي صف', 'انتي بأي صف'], en: ['how old are you', 'what grade are you in', 'asl'], weight: 0.2, severity: 'low' },
      { ar: ['وين ساكن', 'وين ساكنه', 'وين بيتكم', 'وين مدرستك', 'بأي مدرسه', 'ساكنه فين'], en: ['where do you live', 'what school do you go to', "what's your address"], weight: 0.3, severity: 'medium' },
      { ar: ['نتقابل لحالنا', 'تعالي لحالك', 'تعال لحالك', 'لا تجيب احد معك', 'لا تجيبي احد معك', 'بجي اخذك'], en: ['meet up alone', 'come alone', "don't bring anyone", 'i will pick you up'], weight: 0.7, severity: 'high' },
      { ar: ['لا تخبر احد', 'لا تخبري احد', 'لا تعلم احد', 'لا تقول لاحد', 'لا تقولي لاحد'], en: ["don't tell anyone", 'dont tell anyone'], az: ['la t2ol l a7ad'], weight: 0.5, severity: 'medium' },
      { ar: ['بشحن لك', 'اعطيك فلوس', 'بعطيك فلوس', 'اشتري لك شدات', 'بطاقه هدايا'], en: ['free robux', 'free vbucks', "i'll buy you", 'gift card for you'], weight: 0.3, severity: 'medium' },
      { ar: ['انتي لحالك', 'انت لحالك', 'اهلك موجودين'], en: ['are you alone', 'are your parents home'], weight: 0.4, severity: 'medium' },
    ],
  },

  violence: {
    labelAr: 'عنف / تهديد',
    parentGuidanceAr:
      'قيّم جدية التهديد ومن المستهدف. إذا كان طفلك مهدَّداً احتفظ بالأدلة وأبلغ المدرسة. إذا كان طفلك هو من يهدد، تحدّث معه بجدية عن العواقب. إذا كان هناك خطر على أي شخص تواصل مع الجهات المختصة فوراً.',
    terms: [
      { ar: ['بقتلك', 'بذبحك', 'راح اذبحك', 'راح اقتلك', 'هقتلك', 'حاقتلك', 'رح اقتلك', 'بموتك'], en: ['i will kill you', "i'll kill you", 'gonna kill you'], az: ['ba2tlak', 'ra7 a2tlak', 'ha2tlak'], weight: 0.9, severity: 'high' },
      { ar: ['بضربك', 'راح اضربك', 'هضربك', 'بكسر راسك', 'بكسر وجهك'], en: ["i'll beat you up", 'i will beat you', 'break your face'], weight: 0.6, severity: 'medium' },
      { ar: ['اجيب سلاح', 'بجيب مسدس', 'بجيب سلاح', 'اطلق النار', 'بفجر المدرسه', 'افجر المدرسه'], en: ['bring a gun', 'shoot up the school', 'shoot everyone', 'bomb the school'], weight: 1, severity: 'critical' },
      { ar: ['بطعنك', 'راح اطعنك'], en: ["i'll stab you", 'stab you'], weight: 0.9, severity: 'high' },
      { ar: 'سكين', en: 'knife', weight: 0.3, severity: 'low' },
      { ar: ['نستناك بعد المدرسه', 'بنتظرك برا', 'نستناك برا المدرسه'], en: ['wait for you after school', 'catch you after school'], weight: 0.6, severity: 'medium' },
    ],
  },

  drugs: {
    labelAr: 'مخدرات / مواد ضارة',
    parentGuidanceAr: 'افتح حواراً هادئاً حول المخاطر بدل العقاب الفوري، وحاول معرفة مصدر هذه المواد ومن يعرضها على طفلك. استشر مختصاً إذا ظهرت علامات تعاطٍ.',
    terms: [
      { ar: ['حشيش', 'حشيشه', 'بانجو'], en: ['weed', 'edibles'], az: ['hasheesh'], weight: 0.6, severity: 'medium' },
      { ar: ['كبتاجون', 'كبتي', 'شبو', 'حبوب هلوسه', 'ترامادول', 'لاريكا'], en: ['xanax', 'percs', 'percocet', 'fentanyl'], weight: 0.9, severity: 'high' },
      { ar: ['حبوب مخدره', 'مخدرات'], en: ['drugs'], weight: 0.4, severity: 'medium' },
      { ar: ['فيب', 'سيجاره الكترونيه', 'شيشه الكترونيه'], en: ['vape', 'juul'], weight: 0.3, severity: 'low' },
      { ar: ['مين يبيع', 'ابي اشتري حبوب', 'وين القى حبوب'], en: ['who sells', 'where can i get pills'], weight: 0.5, severity: 'medium' },
    ],
  },
};
