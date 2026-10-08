// Detection lexicon. Terms are written naturally and normalized at load time,
// so variants such as "انتحر" / "إنتحر" match the same rule.
//
// weight:   contribution to the category score (0..1). A category alerts once
//           its score reaches the threshold in ruleEngine.js.
// severity: the minimum severity an alert gets when this term matches.
//
// This list is a starting point for an MVP. In production it should be
// maintained with child-safety specialists and per-dialect reviewers.

export const SEVERITIES = ['low', 'medium', 'high', 'critical'];

export const CATEGORIES = {
  self_harm: {
    labelAr: 'إيذاء النفس / أفكار انتحارية',
    parentGuidanceAr:
      'تحدّث مع طفلك بهدوء ودون لوم، واستمع أكثر مما تتكلم. إذا كان هناك خطر فوري تواصل مع خدمات الطوارئ أو خط دعم نفسي محلي.',
    terms: [
      { ar: 'ابي اموت', en: 'i want to die', weight: 1, severity: 'critical' },
      { ar: 'اريد ان اموت', weight: 1, severity: 'critical' },
      { ar: 'بدي موت', weight: 1, severity: 'critical' },
      { ar: 'نفسي اموت', weight: 1, severity: 'critical' },
      { ar: 'راح انتحر', en: 'kill myself', weight: 1, severity: 'critical' },
      { ar: 'افكر في الانتحار', en: 'thinking about suicide', weight: 1, severity: 'critical' },
      { ar: 'انتحار', en: 'suicide', weight: 0.5, severity: 'high' },
      { ar: 'انتحر', en: 'kys', weight: 0.6, severity: 'high' },
      { ar: 'اجرح نفسي', en: 'cut myself', weight: 0.9, severity: 'high' },
      { ar: 'اذي نفسي', en: 'hurt myself', weight: 0.8, severity: 'high' },
      { ar: 'ما في فايده من حياتي', en: 'no reason to live', weight: 0.8, severity: 'high' },
      { ar: 'الكل احسن بدوني', en: 'better off without me', weight: 0.8, severity: 'high' },
    ],
  },

  bullying: {
    labelAr: 'تنمّر إلكتروني',
    parentGuidanceAr:
      'اطمئن على شعور طفلك أولاً، واحتفظ بالأدلة، ولا تردّ على المتنمر نيابةً عنه. يمكن التواصل مع المدرسة إذا كان المتنمر زميلاً.',
    terms: [
      { ar: 'محد يحبك', en: 'nobody likes you', weight: 0.6, severity: 'medium' },
      { ar: 'ما حد بيحبك', weight: 0.6, severity: 'medium' },
      { ar: 'روح موت', en: 'go die', weight: 0.9, severity: 'high' },
      { ar: 'موت احسن لك', en: 'you should die', weight: 0.9, severity: 'high' },
      { ar: 'انت فاشل', en: 'you are a loser', weight: 0.4, severity: 'medium' },
      { ar: 'يا غبي', en: 'you are stupid', weight: 0.3, severity: 'low' },
      { ar: 'يا حمار', weight: 0.3, severity: 'low' },
      { ar: 'شكلك يقرف', en: 'you are ugly', weight: 0.5, severity: 'medium' },
      { ar: 'كلنا نكرهك', en: 'everyone hates you', weight: 0.7, severity: 'medium' },
      { ar: 'بفضحك', en: 'i will expose you', weight: 0.6, severity: 'medium' },
      { ar: 'بنشر صورك', en: 'post your pics', weight: 0.7, severity: 'high' },
    ],
  },

  grooming: {
    labelAr: 'استدراج / تحرّش',
    parentGuidanceAr:
      'لا تواجه الشخص الآخر مباشرة. احتفظ بالأدلة وأبلغ الجهات المختصة أو المنصة. طمئن طفلك أنه ليس مخطئاً.',
    terms: [
      { ar: 'لا تقول لاهلك', en: "don't tell your parents", weight: 0.7, severity: 'high' },
      { ar: 'خليها سر بيننا', en: 'our little secret', weight: 0.7, severity: 'high' },
      { ar: 'احذف المحادثه', en: 'delete this chat', weight: 0.5, severity: 'medium' },
      { ar: 'ارسل صورتك', en: 'send me a pic', weight: 0.4, severity: 'medium' },
      { ar: 'صوره بدون', en: 'send nudes', weight: 1, severity: 'critical' },
      { ar: 'كم عمرك', en: 'how old are you', weight: 0.2, severity: 'low' },
      { ar: 'وين ساكن', en: 'where do you live', weight: 0.3, severity: 'medium' },
      { ar: 'نتقابل لحالنا', en: 'meet up alone', weight: 0.7, severity: 'high' },
      { ar: 'لا تخبر احد', en: "don't tell anyone", weight: 0.5, severity: 'medium' },
    ],
  },

  violence: {
    labelAr: 'عنف / تهديد',
    parentGuidanceAr:
      'قيّم جدية التهديد ومن يستهدف. إذا كان هناك خطر على أي شخص تواصل مع المدرسة أو الجهات المختصة فوراً.',
    terms: [
      { ar: 'بقتلك', en: 'i will kill you', weight: 0.9, severity: 'high' },
      { ar: 'راح اذبحك', weight: 0.9, severity: 'high' },
      { ar: 'بضربك', en: "i'll beat you up", weight: 0.6, severity: 'medium' },
      { ar: 'اجيب سلاح', en: 'bring a gun', weight: 1, severity: 'critical' },
      { ar: 'سكين', en: 'knife', weight: 0.3, severity: 'low' },
      { ar: 'نستناك بعد المدرسه', en: 'wait for you after school', weight: 0.6, severity: 'medium' },
    ],
  },

  drugs: {
    labelAr: 'مخدرات / مواد ضارة',
    parentGuidanceAr: 'افتح حواراً هادئاً حول المخاطر، وابحث عن مصدر هذه المواد ومن يعرضها على طفلك.',
    terms: [
      { ar: 'حشيش', en: 'weed', weight: 0.6, severity: 'medium' },
      { ar: 'كبتاجون', weight: 0.9, severity: 'high' },
      { ar: 'حبوب مخدره', en: 'pills', weight: 0.5, severity: 'medium' },
      { ar: 'مخدرات', en: 'drugs', weight: 0.4, severity: 'medium' },
      { ar: 'فيب', en: 'vape', weight: 0.3, severity: 'low' },
    ],
  },
};
