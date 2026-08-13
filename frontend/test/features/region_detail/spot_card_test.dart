import 'package:culturepath/features/region_detail/data/spot_model.dart';
import 'package:culturepath/features/region_detail/presentation/widgets/spot_card.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _EmptyAssetLoader extends AssetLoader {
  const _EmptyAssetLoader();

  @override
  Future<Map<String, dynamic>> load(String path, Locale locale) async => {};
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(EasyLocalization.ensureInitialized);

  testWidgets('keeps image, title, and add actions independent', (tester) async {
    var openCount = 0;
    var addCount = 0;
    const spot = SpotItem(
      contentId: '1',
      title: '박경리기념관',
      address: '통영시',
      tel: '',
      openTime: '',
      category: '문학',
    );

    await tester.pumpWidget(
      EasyLocalization(
        supportedLocales: const [Locale('ko')],
        path: 'unused',
        assetLoader: const _EmptyAssetLoader(),
        startLocale: const Locale('ko'),
        saveLocale: false,
        child: Builder(
          builder: (context) => MaterialApp(
            localizationsDelegates: context.localizationDelegates,
            supportedLocales: context.supportedLocales,
            locale: context.locale,
            home: Scaffold(
              body: SingleChildScrollView(
                child: SpotCard(
                  spot: spot,
                  isSelected: false,
                  onOpen: () => openCount += 1,
                  onAdd: () => addCount += 1,
                ),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.byKey(const ValueKey('spot-open-image-1')));
    await tester.tap(find.byKey(const ValueKey('spot-open-title-1')));
    expect(openCount, 2);
    expect(addCount, 0);

    await tester.tap(find.byKey(const ValueKey('spot-add-1')));
    expect(openCount, 2);
    expect(addCount, 1);
  });
}
